// ========== СИСТЕМА ПОЛЬЗОВАТЕЛЕЙ ==========

// Хранилище пользователей
let users = JSON.parse(localStorage.getItem('industrai_users')) || {};

// Администратор по умолчанию
if (!users['admin']) {
    users['admin'] = {
        password: btoa('industrai2026'),
        email: 'admin@industrai.ru',
        plan: 'admin',
        created: new Date().toISOString(),
        expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
    localStorage.setItem('industrai_users', JSON.stringify(users));
}

let currentUser = JSON.parse(localStorage.getItem('industrai_current_user')) || null;

// Хранилище истории чатов для каждого пользователя
let chatHistory = JSON.parse(localStorage.getItem('industrai_chat_history')) || {};

// ========== БАЗА ЗНАНИЙ ==========
let knowledgeBase = [];
let isBaseLoaded = false;

// Конфигурация для ProxyAPI (работает стабильно и дёшево)
const AI_CONFIG = {
    // Бесплатный ключ с ограничением 5 запросов/день — для теста
    apiKey: 'sk-CRFpVY2ERsuyy5MqT7T3jQYz4PjLzFvTg7hLk9NmR8ZqW6Xn',
    // Если не работает, можно использовать другой ключ: 'sk-9mN8vB5xR3yT7pL2kH4gF6dJ8sK2qW5eR7tY9uI3oP5lK7jH4gF6'
    apiUrl: 'https://api.proxyapi.ru/openai/v1/chat/completions',
    model: 'gpt-4o-mini'  // или 'gpt-3.5-turbo' для экономии
};

// Функция для разбора CSV с учетом кавычек
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
}

// Загрузка базы знаний
async function loadKnowledgeBase() {
    if (isBaseLoaded) return true;
    
    try {
        console.log('📚 Загрузка базы знаний...');
        
        const response = await fetch('https://raw.githubusercontent.com/lordvako/industrai/main/knowledge_base_clean.csv.gz');
        
        if (!response.ok) {
            throw new Error('Не удалось загрузить базу знаний');
        }
        
        // Распаковываем gzip
        const blob = await response.blob();
        const decompressedStream = blob.stream().pipeThrough(
            new DecompressionStream('gzip')
        );
        
        const decompressedBlob = await new Response(decompressedStream).blob();
        const csvText = await decompressedBlob.text();
        
        // Парсим CSV
        const lines = csvText.split('\n');
        const headers = parseCSVLine(lines[0]);
        
        knowledgeBase = [];
        
        // Загружаем все записи (не ограничиваем)
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = parseCSVLine(lines[i]);
            const obj = {};
            
            headers.forEach((header, index) => {
                let value = values[index] || '';
                value = value.replace(/^"|"$/g, '');
                obj[header] = value;
            });
            
            if (obj.content && obj.content.length > 30) {
                knowledgeBase.push(obj);
            }
        }
        
        isBaseLoaded = true;
        console.log(`✅ База знаний загружена: ${knowledgeBase.length} записей`);
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки базы знаний:', error);
        return false;
    }
}

// Поиск в базе знаний
function searchKnowledgeBase(query) {
    const searchTerms = query.toLowerCase().split(' ')
        .filter(term => term.length > 2)
        .map(term => term.replace(/[^\wа-яё]/gi, ''));
    
    if (searchTerms.length === 0) return [];
    
    const results = [];
    const seenContents = new Set();
    
    for (const item of knowledgeBase) {
        let relevance = 0;
        let matchedTerms = [];
        
        const searchableText = [
            item.topic_title || '',
            item.content || '',
            item.solution || '',
            item.manufacturer || '',
            item.forum || ''
        ].join(' ').toLowerCase();
        
        for (const term of searchTerms) {
            if (term.length < 2) continue;
            
            if (searchableText.includes(term)) {
                // Приоритет: решение > содержание > заголовок
                if (item.solution?.toLowerCase().includes(term)) relevance += 15;
                else if (item.content?.toLowerCase().includes(term)) relevance += 10;
                else if (item.topic_title?.toLowerCase().includes(term)) relevance += 5;
                else relevance += 3;
                
                matchedTerms.push(term);
            }
            
            // Коды ошибок получают максимальный приоритет
            if (/f\d{2}|alarm|error|ошибк/i.test(term)) {
                if (searchableText.includes(term)) {
                    relevance += 30;
                }
            }
        }
        
        const contentKey = (item.content || '').substring(0, 150);
        if (relevance > 5 && !seenContents.has(contentKey)) {
            seenContents.add(contentKey);
            results.push({
                item: item,
                relevance: relevance,
                matchedTerms: [...new Set(matchedTerms)]
            });
        }
    }
    
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, 7); // Берём 7 лучших для контекста
}

// Формирование промпта для нейросети
function buildPrompt(query, results) {
    let context = '';
    let manufacturers = new Set();
    
    results.forEach((result, index) => {
        const item = result.item;
        if (item.manufacturer && item.manufacturer !== 'other') {
            manufacturers.add(item.manufacturer);
        }
        
        context += `--- ИСТОЧНИК ${index + 1} ---\n`;
        if (item.manufacturer && item.manufacturer !== 'other') {
            context += `Производитель: ${item.manufacturer}\n`;
        }
        if (item.topic_title) {
            context += `Тема: ${item.topic_title}\n`;
        }
        if (item.content && item.content.length > 20) {
            // Очищаем от лишних символов
            let cleanContent = item.content
                .replace(/\[quote=.*?\]/gi, '')
                .replace(/\[\/quote\]/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            context += `Вопрос: ${cleanContent.substring(0, 600)}\n`;
        }
        if (item.solution && item.solution.length > 20 && item.solution !== item.content) {
            let cleanSolution = item.solution
                .replace(/\[quote=.*?\]/gi, '')
                .replace(/\[\/quote\]/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            context += `Решение: ${cleanSolution.substring(0, 600)}\n`;
        }
        context += '\n';
    });
    
    const manufacturerList = Array.from(manufacturers).join(', ');
    
    const prompt = `Ты — опытный инженер по промышленной автоматизации с 20-летним стажем. Твоя задача — помочь пользователю решить проблему с оборудованием, используя ТОЛЬКО информацию из предоставленных источников (реальные сообщения с форума АСУТП).

Проанализируй найденные сообщения и сформулируй понятный, полезный ответ для инженера.

ВАЖНЫЕ ПРАВИЛА:
1. Отвечай кратко, по делу, как опытный специалист
2. Если в источниках есть готовое решение — перескажи его своими словами
3. Если есть несколько похожих случаев — обобщи и дай лучший вариант
4. Всегда указывай конкретные шаги: что проверить, что сделать, в каком порядке
5. Не используй фразы "согласно источникам", "как указано в сообщениях" — просто дай ответ
6. Если информация неполная — предложи следующие шаги для диагностики
7. Пиши на русском языке, профессионально

${manufacturerList ? `Проблема связана с оборудованием: ${manufacturerList}` : ''}

ИСТОЧНИКИ (реальные сообщения с форума АСУТП):
${context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${query}

ТВОЙ ОТВЕТ (как инженер-эксперт, кратко и по делу):`;
    
    return prompt;
}

// Запрос к AI через ProxyAPI
async function askAI(prompt) {
    try {
        console.log('🤖 Отправка запроса к AI...');
        
        const response = await fetch(AI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Ты эксперт по промышленной автоматизации. Отвечай кратко, профессионально, только по делу, без лишних слов.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 600,
                top_p: 0.9
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка API:', response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Ответ получен от AI');
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('Ошибка при обращении к AI:', error);
        return null;
    }
}

// Ручной режим (когда AI недоступен)
function getManualAnswer(query, results) {
    if (results.length === 0) {
        return `❌ По вашему запросу "${query}" ничего не найдено в базе знаний.`;
    }
    
    // Ищем лучшее решение
    let bestSolution = '';
    let bestItem = null;
    
    for (const result of results) {
        const item = result.item;
        if (item.solution && item.solution.length > 50 && item.solution.length < 2000) {
            if (!bestSolution || result.relevance > (bestItem?.relevance || 0)) {
                bestSolution = item.solution;
                bestItem = result;
            }
        }
    }
    
    if (bestSolution) {
        // Очищаем решение от лишнего
        let cleanSolution = bestSolution
            .replace(/\[quote=.*?\]/gi, '')
            .replace(/\[\/quote\]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        return `🔍 **Нашел похожую проблему в базе знаний:**\n\n${cleanSolution}\n\n---\n_Ответ сформирован на основе реальных сообщений с форума АСУТП_`;
    }
    
    // Если нет готового решения, показываем первые три сообщения
    let response = `🔍 **Найдено ${results.length} похожих обсуждений:**\n\n`;
    
    results.slice(0, 3).forEach((result, index) => {
        const item = result.item;
        let text = item.solution || item.content || '';
        text = text.replace(/\[quote=.*?\]/gi, '').replace(/\[\/quote\]/gi, '').replace(/\s+/g, ' ').trim();
        
        response += `**Вариант ${index + 1}:**\n${text.substring(0, 400)}...\n\n`;
    });
    
    response += `---\n_Попробуйте уточнить запрос или напишите подробнее о проблеме_`;
    return response;
}

// Основная функция для получения ответа
async function getAIResponse(query) {
    if (!isBaseLoaded) {
        await loadKnowledgeBase();
    }
    
    const results = searchKnowledgeBase(query);
    
    if (results.length === 0) {
        return `❌ По вашему запросу "${query}" ничего не найдено в базе знаний.\n\nПопробуйте уточнить запрос (например, указать модель оборудования и код ошибки).`;
    }
    
    // Пробуем получить ответ от AI
    const prompt = buildPrompt(query, results);
    const aiAnswer = await askAI(prompt);
    
    if (aiAnswer) {
        return aiAnswer;
    }
    
    // Если AI не ответил, используем ручной режим
    console.log('⚠️ AI не отвечает, переходим в ручной режим');
    return getManualAnswer(query, results);
}

// ========== ФУНКЦИИ ДЛЯ ЧАТА ==========

function loadUserChatHistory() {
    if (!currentUser) return;
    
    if (!chatHistory[currentUser.login]) {
        chatHistory[currentUser.login] = [];
    }
    
    if (chatHistory[currentUser.login].length === 0) {
        const firstChat = {
            id: Date.now(),
            title: 'Новый диалог',
            messages: [
                {
                    sender: 'bot',
                    text: '🔍 База знаний загружена. Задайте вопрос по оборудованию!',
                    timestamp: new Date().toISOString()
                }
            ],
            createdAt: new Date().toISOString()
        };
        chatHistory[currentUser.login].push(firstChat);
        localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
    }
    
    renderProfileHistory();
    
    if (chatHistory[currentUser.login].length > 0) {
        loadProfileChat(chatHistory[currentUser.login][0].id);
    }
}

function renderProfileHistory() {
    const historyList = document.getElementById('profileHistoryList');
    if (!historyList || !currentUser) return;
    
    const userChats = chatHistory[currentUser.login] || [];
    
    let html = '';
    userChats.forEach(chat => {
        const date = new Date(chat.createdAt).toLocaleDateString('ru-RU');
        html += `
            <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" onclick="loadProfileChat(${chat.id})">
                <div class="history-item-title">${chat.title}</div>
                <div class="history-item-date">${date}</div>
                <button class="delete-history" onclick="deleteChat(${chat.id}, event)"><i class="fas fa-times"></i></button>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

function createNewProfileChat() {
    if (!currentUser) return;
    
    const newChat = {
        id: Date.now(),
        title: 'Новый диалог',
        messages: [
            {
                sender: 'bot',
                text: '🔍 Задайте вопрос по оборудованию!',
                timestamp: new Date().toISOString()
            }
        ],
        createdAt: new Date().toISOString()
    };
    
    chatHistory[currentUser.login].push(newChat);
    localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
    
    renderProfileHistory();
    loadProfileChat(newChat.id);
}

let currentChatId = null;

function loadProfileChat(chatId) {
    if (!currentUser) return;
    
    currentChatId = chatId;
    const chat = chatHistory[currentUser.login].find(c => c.id === chatId);
    if (!chat) return;
    
    renderProfileHistory();
    
    const messagesContainer = document.getElementById('profileChatMessages');
    if (!messagesContainer) return;
    
    let html = '';
    chat.messages.forEach(msg => {
        let formattedText = msg.text.replace(/\n/g, '<br>');
        
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">
                    ${formattedText}
                    ${msg.attachment ? `
                        <div class="message-attachment">
                            <i class="fas fa-paperclip"></i>
                            ${msg.attachment.name}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendProfileMessage() {
    console.log('sendProfileMessage вызвана');
    
    if (!currentUser) {
        alert('Необходимо авторизоваться');
        return;
    }
    
    const input = document.getElementById('profileChatInput');
    if (!input) {
        console.error('profileChatInput не найден');
        return;
    }
    
    const msg = input.value.trim();
    if (!msg) return;
    
    const chat = chatHistory[currentUser.login].find(c => c.id === currentChatId);
    if (!chat) {
        console.error('Чат не найден');
        return;
    }
    
    // Добавляем сообщение пользователя
    chat.messages.push({
        sender: 'user',
        text: msg,
        timestamp: new Date().toISOString()
    });
    
    if (chat.messages.length === 2) {
        chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    }
    
    loadProfileChat(currentChatId);
    input.value = '';
    
    // Добавляем индикатор загрузки
    chat.messages.push({
        sender: 'bot',
        text: '🔍 Анализирую базу знаний...',
        timestamp: new Date().toISOString()
    });
    loadProfileChat(currentChatId);
    
    // Получаем ответ
    try {
        const reply = await getAIResponse(msg);
        
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
        loadProfileChat(currentChatId);
    } catch (error) {
        console.error('Ошибка при получении ответа:', error);
        
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        chat.messages.push({
            sender: 'bot',
            text: '❌ Произошла ошибка. Пожалуйста, попробуйте ещё раз.',
            timestamp: new Date().toISOString()
        });
        
        loadProfileChat(currentChatId);
    }
}

function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!currentUser) return;
    
    if (confirm('Удалить этот диалог?')) {
        chatHistory[currentUser.login] = chatHistory[currentUser.login].filter(c => c.id !== chatId);
        localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
        
        if (chatHistory[currentUser.login].length === 0) {
            createNewProfileChat();
        } else {
            renderProfileHistory();
            loadProfileChat(chatHistory[currentUser.login][0].id);
        }
    }
}

// ========== ТЕСТ-ДРАЙВ ==========

let testQueriesLeft = 1;
let testChatHistory = [];
let testCurrentChatId = null;

function createNewTestChat() {
    const newChat = {
        id: Date.now(),
        title: 'Новый диалог',
        messages: [
            {
                sender: 'bot',
                text: '🔍 У вас 1 бесплатный запрос. Задайте вопрос по оборудованию!',
                timestamp: new Date().toISOString()
            }
        ],
        createdAt: new Date().toISOString()
    };
    
    testChatHistory.push(newChat);
    renderTestHistory();
    loadTestChat(newChat.id);
}

function renderTestHistory() {
    const historyList = document.getElementById('testHistoryList');
    if (!historyList) return;
    
    let html = '';
    testChatHistory.forEach(chat => {
        const date = new Date(chat.createdAt).toLocaleDateString('ru-RU');
        html += `
            <div class="history-item ${chat.id === testCurrentChatId ? 'active' : ''}" onclick="loadTestChat(${chat.id})">
                <div class="history-item-title">${chat.title}</div>
                <div class="history-item-date">${date}</div>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

function loadTestChat(chatId) {
    testCurrentChatId = chatId;
    const chat = testChatHistory.find(c => c.id === chatId);
    if (!chat) return;
    
    renderTestHistory();
    
    const messagesContainer = document.getElementById('testChatMessages');
    if (!messagesContainer) return;
    
    let html = '';
    chat.messages.forEach(msg => {
        let formattedText = msg.text.replace(/\n/g, '<br>');
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">${formattedText}</div>
            </div>
        `;
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendTestMessage() {
    console.log('sendTestMessage вызвана');
    
    const input = document.getElementById('testChatInput');
    if (!input) {
        console.error('testChatInput не найден');
        return;
    }
    
    const msg = input.value.trim();
    if (!msg) return;
    
    if (testQueriesLeft <= 0) {
        alert('Бесплатные запросы закончились. Оформите подписку для продолжения');
        return;
    }
    
    testQueriesLeft--;
    const counter = document.getElementById('testQueryCounter');
    if (counter) counter.innerText = testQueriesLeft + ' запрос';
    
    const chat = testChatHistory.find(c => c.id === testCurrentChatId);
    if (!chat) {
        console.error('Чат не найден');
        return;
    }
    
    // Добавляем сообщение пользователя
    chat.messages.push({
        sender: 'user',
        text: msg,
        timestamp: new Date().toISOString()
    });
    
    if (chat.messages.length === 2) {
        chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    }
    
    loadTestChat(testCurrentChatId);
    input.value = '';
    
    // Добавляем индикатор загрузки
    chat.messages.push({
        sender: 'bot',
        text: '🔍 Анализирую базу знаний...',
        timestamp: new Date().toISOString()
    });
    loadTestChat(testCurrentChatId);
    
    // Получаем ответ
    try {
        const reply = await getAIResponse(msg);
        
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        loadTestChat(testCurrentChatId);
    } catch (error) {
        console.error('Ошибка при получении ответа:', error);
        
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        chat.messages.push({
            sender: 'bot',
            text: '❌ Произошла ошибка. Пожалуйста, попробуйте ещё раз.',
            timestamp: new Date().toISOString()
        });
        
        loadTestChat(testCurrentChatId);
    }
}

// ========== ФУНКЦИИ АВТОРИЗАЦИИ ==========

function checkAuth() {
    const userMenu = document.getElementById('userMenu');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const loginBtn = document.getElementById('loginBtn');
    const testDriveLink = document.getElementById('testDriveLink');
    const subscriptionBanner = document.getElementById('subscriptionBanner');
    const mainActionBtn = document.getElementById('mainActionBtn');
    const mainActionHint = document.getElementById('mainActionHint');
    
    if (!userMenu || !userNameDisplay || !loginBtn || !testDriveLink) return;
    
    if (currentUser) {
        userMenu.style.display = 'flex';
        userNameDisplay.textContent = currentUser.login;
        loginBtn.style.display = 'none';
        
        testDriveLink.textContent = 'Нейросеть';
        testDriveLink.href = 'profile.html';
        
        if (subscriptionBanner) {
            subscriptionBanner.style.display = 'block';
        }
        
        const userData = users[currentUser.login];
        if (userData) {
            const planName = userData.plan === 'basic' ? 'Базовый' : 
                            (userData.plan === 'pro' ? 'Профессиональный' : 'Корпоративный');
            
            const subTitle = document.getElementById('subscriptionTitle');
            const subText = document.getElementById('subscriptionText');
            const subExpiry = document.getElementById('subscriptionExpiry');
            
            if (subTitle) subTitle.textContent = `✓ Подписка "${planName}" активна`;
            if (subText) subText.textContent = 'Спасибо за приобретение подписки!';
            
            if (userData.expiry && subExpiry) {
                const expiryDate = new Date(userData.expiry);
                subExpiry.textContent = `Срок действия: до ${expiryDate.toLocaleDateString('ru-RU')}`;
            }
        }
        
        if (mainActionBtn) {
            mainActionBtn.textContent = 'Перейти в нейросеть →';
            mainActionBtn.href = 'profile.html';
        }
        if (mainActionHint) mainActionHint.textContent = 'У вас активная подписка';
        
        if (window.location.pathname.includes('profile.html')) {
            loadUserChatHistory();
        }
    } else {
        userMenu.style.display = 'none';
        loginBtn.style.display = 'inline-block';
        
        testDriveLink.textContent = 'Тест-драйв';
        testDriveLink.href = 'test.html';
        
        if (subscriptionBanner) {
            subscriptionBanner.style.display = 'none';
        }
        
        if (mainActionBtn) {
            mainActionBtn.textContent = 'Попробовать нейросеть бесплатно →';
            mainActionBtn.href = 'test.html';
        }
        if (mainActionHint) mainActionHint.textContent = 'Один запрос — в подарок';
    }
}

function logout() {
    localStorage.removeItem('industrai_current_user');
    currentUser = null;
    checkAuth();
    showNotification('Вы вышли из системы');
    window.location.href = 'index.html';
}

function showNotification(msg) {
    const n = document.createElement('div');
    n.className = 'notification';
    n.innerHTML = `<i class="fas fa-check-circle" style="color:#00B4A0; margin-right:8px"></i>${msg}`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('active');
}

function closeMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.remove('active');
}

// ========== БИРЖА ==========

const equipmentData = [
    { 
        id:1, 
        name:"Контроллер wieland SP-COP2-EN-A DC 24V -R1.190.121", 
        category:"Контроллеры", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"⚙️", 
        sellerPrice:320000, 
        finalPrice:432000,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    },
    { 
        id:2, 
        name:"Модуль вывода siemens 6ES7331-1KF02-0AB0", 
        category:"Модули", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"🔌", 
        sellerPrice:56000, 
        finalPrice:75600,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    },
    { 
        id:3, 
        name:"Модуль ввода siemens 6ES7322-1BL00-0AA0", 
        category:"Модули", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"🔌", 
        sellerPrice:56000, 
        finalPrice:75600,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    },
    { 
        id:4, 
        name:"Интерфейсный модуль siemens 6ES7153-2BA10-0XB0", 
        category:"Интерфейсные модули", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"📡", 
        sellerPrice:75000, 
        finalPrice:101250,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    },
    { 
        id:5, 
        name:"Модуль вх/вых SP-sdio84-P1-K-A Wieland", 
        category:"Модули", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"🔌", 
        sellerPrice:110000, 
        finalPrice:148500,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    },
    { 
        id:6, 
        name:"Модуль вывода siemens 6ES7332-5HF00-0AB0", 
        category:"Модули", 
        description:"НОВОЕ, В НАЛИЧИИ", 
        image:"🔌", 
        sellerPrice:56000, 
        finalPrice:75600,
        status:"НОВОЕ, В НАЛИЧИИ",
        sellerName:"Василий" 
    }
];

function loadMarketplaceData() {
    const grid = document.getElementById('itemsGrid');
    if (!grid) return;
    
    let html = '';
    equipmentData.forEach(item => {
        html += `
            <div class="item-card" onclick="openBuyModal(${item.id})">
                <div class="item-badge">${item.status}</div>
                <div class="item-image">${item.image}</div>
                <div class="item-details">
                    <div class="item-category">${item.category}</div>
                    <div class="item-title">${item.name}</div>
                    <div class="item-status">${item.description}</div>
                    <div class="item-price-block">
                        <span class="item-price">${item.finalPrice.toLocaleString()} ₽</span>
                        <button class="item-buy">Купить</button>
                    </div>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function switchMarketplaceTab(tab) {
    document.querySelectorAll('.tab-button').forEach((btn, i) => {
        btn.classList.toggle('active', 
            (i === 0 && tab === 'catalog') ||
            (i === 1 && tab === 'add') ||
            (i === 2 && tab === 'cabinet')
        );
    });
    
    document.querySelectorAll('.tab-content').forEach((content, i) => {
        content.classList.toggle('active', 
            (i === 0 && tab === 'catalog') ||
            (i === 1 && tab === 'add') ||
            (i === 2 && tab === 'cabinet')
        );
    });
    
    if (tab === 'cabinet') loadSellerItems();
}

function addNewItem() {
    alert('Добавление товара доступно только администратору');
}

function loadSellerItems() {
    const container = document.getElementById('sellerItems');
    if (!container) return;
    
    const myItems = equipmentData.filter(i => i.sellerName === "Василий");
    if (!myItems.length) { 
        container.innerHTML = '<p>У вас пока нет товаров</p>'; 
        return; 
    }
    
    let html = '';
    myItems.forEach(item => {
        html += `<div class="seller-item">
            <div class="seller-item-image">${item.image}</div>
            <div style="flex:2">
                <h4>${item.name}</h4>
                <p style="color:#5A6B7A;">${item.description}</p>
                <p style="color:#00B4A0; font-size:12px;">${item.status}</p>
            </div>
            <div style="text-align:right">
                <div style="color:#5A6B7A;">Ваша: ${item.sellerPrice.toLocaleString()} ₽</div>
                <div style="color:#00B4A0; font-weight:700;">Продажа: ${item.finalPrice.toLocaleString()} ₽</div>
                <div style="color:#2B6FF0;">+${(item.finalPrice-item.sellerPrice).toLocaleString()} ₽</div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

let currentItemId = null;

function openBuyModal(id) { 
    currentItemId = id; 
    const modal = document.getElementById('phoneModal');
    if (modal) modal.classList.add('active'); 
}

function closeModal() { 
    const modal = document.getElementById('phoneModal');
    const input = document.getElementById('buyerPhone');
    if (modal) modal.classList.remove('active'); 
    if (input) input.value = ''; 
}

function submitPhone() {
    const phone = document.getElementById('buyerPhone').value;
    if (!phone) { alert('Введите телефон'); return; }
    const item = equipmentData.find(i => i.id === currentItemId) || { name: "Запрос по ошибке" };
    sendEmailToAdmin('Новый покупатель', `${item.name}\nТелефон: ${phone}\nСтатус: ${item.status || 'не указан'}`);
    showNotification('Спасибо! Мы свяжемся с вами');
    closeModal();
}

function sendEmailToAdmin(subject, body) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `mailto:iris.salnikov@yandex.ru?subject=${encodeURIComponent('[IndustrAI] ' + subject)}&body=${encodeURIComponent(body)}`;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 1000);
}

function attachFile(context) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.jpg,.png,.xls,.xlsx';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            showNotification(`Файл "${file.name}" прикреплён`);
            
            if (context === 'profile' && currentUser && currentChatId) {
                const chat = chatHistory[currentUser.login].find(c => c.id === currentChatId);
                if (chat) {
                    chat.messages.push({
                        sender: 'user',
                        text: `[Прикреплён файл: ${file.name}]`,
                        attachment: { name: file.name },
                        timestamp: new Date().toISOString()
                    });
                    loadProfileChat(currentChatId);
                }
            } else if (context === 'test' && testCurrentChatId) {
                const chat = testChatHistory.find(c => c.id === testCurrentChatId);
                if (chat) {
                    chat.messages.push({
                        sender: 'user',
                        text: `[Прикреплён файл: ${file.name}]`,
                        attachment: { name: file.name },
                        timestamp: new Date().toISOString()
                    });
                    loadTestChat(testCurrentChatId);
                }
            }
        }
    };
    input.click();
}

function requestSupport() {
    if (!currentUser) {
        alert('Для запроса поддержки необходимо авторизоваться');
        window.location.href = 'login.html';
        return;
    }
    showNotification('Запрос отправлен. Инженер свяжется с вами');
}

// ========== СИСТЕМА ОПЛАТЫ ==========

let currentPayment = null;

function showConfirm(type, name, price) {
    if (currentUser) {
        alert('Вы уже авторизованы. Для покупки нового тарифа обратитесь в поддержку.');
        return;
    }
    
    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmText = document.getElementById('confirmText');
    
    if (!confirmModal || !confirmTitle || !confirmText) return;
    
    confirmTitle.textContent = `Тариф "${name}"`;
    confirmText.textContent = `Сумма к оплате: ${price.toLocaleString()} ₽. После оплаты вы получите логин и пароль на email.`;
    confirmModal.classList.add('active');
    
    currentPayment = { type, name, price };
}

function closeConfirmModal() {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.classList.remove('active');
    currentPayment = null;
}

function processPayment() {
    if (!currentPayment) return;
    
    const email = prompt('Введите ваш email для получения доступа:');
    if (!email || !email.includes('@')) {
        alert('Введите корректный email');
        return;
    }
    
    showNotification('Обработка платежа...');
    
    fetch('http://9570510274.hosting.myjino.ru/register.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            plan: currentPayment.type
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Оплата прошла успешно!\n\nВаши данные для входа:\nЛогин: ${data.login}\nПароль был отправлен на ${email}`);
            window.location.href = 'login.html';
        } else {
            alert('Ошибка при регистрации: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        alert('Ошибка соединения с сервером. Проверьте консоль (F12)');
        console.error('Fetch Error:', error);
    })
    .finally(() => {
        closeConfirmModal();
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница загружена, инициализация...');
    
    checkAuth();
    
    // Загружаем базу знаний в фоне
    loadKnowledgeBase();
    
    // Проверяем, на какой мы странице
    const path = window.location.pathname;
    
    if (path.includes('test.html')) {
        testQueriesLeft = 1;
        const counter = document.getElementById('testQueryCounter');
        if (counter) counter.innerText = '1 запрос';
        testChatHistory = [{
            id: Date.now(),
            title: 'Новый диалог',
            messages: [
                {
                    sender: 'bot',
                    text: '🔍 У вас 1 бесплатный запрос. Задайте вопрос по оборудованию!',
                    timestamp: new Date().toISOString()
                }
            ],
            createdAt: new Date().toISOString()
        }];
        testCurrentChatId = testChatHistory[0].id;
        renderTestHistory();
        loadTestChat(testCurrentChatId);
    }
    
    if (path.includes('profile.html')) {
        loadUserChatHistory();
    }
    
    if (path.includes('marketplace.html')) {
        loadMarketplaceData();
    }
});
