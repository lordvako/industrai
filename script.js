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

// Конфигурация для DeepSeek
const DEEPSEEK_CONFIG = {
    apiKey: 'sk-6f2c9043acad4e278f5a3a230a1b5e33', // ЗАМЕНИТЕ НА ВАШ КЛЮЧ
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat'
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
        
        // Пробуем загрузить с GitHub (замените на вашу ссылку)
        const response = await fetch('https://raw.githubusercontent.com/lordvako/industrai/main/knowledge_base_clean.csv.gz');
        
        if (!response.ok) {
            // Если не получилось, пробуем локально
            const localResponse = await fetch('knowledge_base_clean.csv.gz');
            if (!localResponse.ok) throw new Error('Не удалось загрузить базу знаний');
            var finalResponse = localResponse;
        } else {
            var finalResponse = response;
        }
        
        // Распаковываем gzip
        const blob = await finalResponse.blob();
        const decompressedStream = blob.stream().pipeThrough(
            new DecompressionStream('gzip')
        );
        
        const decompressedBlob = await new Response(decompressedStream).blob();
        const csvText = await decompressedBlob.text();
        
        // Парсим CSV
        const lines = csvText.split('\n');
        const headers = parseCSVLine(lines[0]);
        
        knowledgeBase = [];
        
        // Загружаем максимум 3000 записей для производительности
        const maxLines = Math.min(lines.length, 3000);
        
        for (let i = 1; i < maxLines; i++) {
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

// Улучшенный поиск в базе знаний
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
                if (item.solution?.toLowerCase().includes(term)) relevance += 10;
                else if (item.content?.toLowerCase().includes(term)) relevance += 7;
                else if (item.topic_title?.toLowerCase().includes(term)) relevance += 5;
                else relevance += 3;
                
                matchedTerms.push(term);
            }
            
            // Поиск кодов ошибок (F01, F04, ALARM и т.д.)
            if (/f\d{2}|alarm|error|ошибк/i.test(term)) {
                const errorPattern = new RegExp(term, 'i');
                if (errorPattern.test(searchableText)) {
                    relevance += 20; // Очень высокий приоритет для кодов ошибок
                    if (!matchedTerms.includes(term)) matchedTerms.push(term);
                }
            }
        }
        
        // Убираем дубликаты по содержанию
        const contentKey = (item.content || '').substring(0, 150);
        if (relevance > 3 && !seenContents.has(contentKey)) {
            seenContents.add(contentKey);
            results.push({
                item: item,
                relevance: relevance,
                matchedTerms: [...new Set(matchedTerms)]
            });
        }
    }
    
    // Сортируем по релевантности
    results.sort((a, b) => b.relevance - a.relevance);
    
    // Возвращаем топ-10 для лучшего контекста
    return results.slice(0, 10);
}

// Формирование промпта для нейросети
function buildPrompt(query, results) {
    let context = '';
    
    results.forEach((result, index) => {
        const item = result.item;
        context += `[ИНФОРМАЦИЯ ${index + 1}]\n`;
        if (item.manufacturer && item.manufacturer !== 'other') {
            context += `Производитель: ${item.manufacturer}\n`;
        }
        if (item.topic_title) {
            context += `Тема: ${item.topic_title}\n`;
        }
        if (item.content && item.content.length > 20) {
            context += `Вопрос: ${item.content.substring(0, 800)}\n`;
        }
        if (item.solution && item.solution.length > 20 && item.solution !== item.content) {
            context += `Решение: ${item.solution.substring(0, 800)}\n`;
        }
        context += '\n';
    });
    
    const prompt = `Ты — опытный инженер по промышленной автоматизации с 20-летним стажем. Отвечай на вопросы пользователей, используя ТОЛЬКО информацию из предоставленного контекста. Если в контексте нет информации для ответа, напиши "К сожалению, в моей базе знаний пока нет информации по этому вопросу."

ВАЖНЫЕ ПРАВИЛА:
1. Отвечай кратко, по делу, как опытный специалист
2. Если в контексте есть готовое решение — перескажи его своими словами
3. Если есть несколько похожих случаев — обобщи и дай лучший вариант
4. Всегда указывай конкретные шаги: что проверить, что сделать
5. Не используй фразы "согласно контексту", "как указано в источниках" и т.п.
6. Пиши на русском языке, профессионально

Контекст (реальные сообщения с форума АСУТП):
${context}

Вопрос пользователя: ${query}

Твой ответ (как инженер-эксперт):`;
    
    return prompt;
}

// Запрос к DeepSeek API
async function askDeepSeek(prompt) {
    try {
        const response = await fetch(DEEPSEEK_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Ты эксперт по промышленной автоматизации. Отвечай кратко, профессионально, только по делу.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 800,
                top_p: 0.9
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('Ошибка при обращении к DeepSeek:', error);
        return null;
    }
}

// Основная функция для получения ответа
async function getAIResponse(query) {
    // Ждем загрузки базы знаний
    if (!isBaseLoaded) {
        await loadKnowledgeBase();
    }
    
    // Ищем похожие записи
    const results = searchKnowledgeBase(query);
    
    // Если ничего не найдено
    if (results.length === 0) {
        return `❌ По вашему запросу "${query}" ничего не найдено в базе знаний.

Попробуйте:
• Уточнить запрос (например, "SEW F04" или "Siemens ошибка SF")
• Использовать другие ключевые слова
• Проверить правильность кода ошибки

Если проблема не решается — задайте вопрос иначе.`;
    }
    
    // Формируем промпт
    const prompt = buildPrompt(query, results);
    
    // Отправляем запрос к DeepSeek
    const answer = await askDeepSeek(prompt);
    
    // Если DeepSeek не ответил, используем резервный вариант
    if (!answer) {
        return formatFallbackResponse(results, query);
    }
    
    return answer;
}

// Резервный вариант (если DeepSeek недоступен)
function formatFallbackResponse(results, query) {
    let response = `🔍 **Найдено в базе знаний (${results.length} записей):**\n\n`;
    
    results.slice(0, 3).forEach((result, index) => {
        const item = result.item;
        
        response += `📌 **Вариант ${index + 1}**\n`;
        
        if (item.solution && item.solution.length > 20) {
            response += `${item.solution.substring(0, 300)}...\n\n`;
        } else if (item.content && item.content.length > 20) {
            response += `${item.content.substring(0, 300)}...\n\n`;
        }
    });
    
    response += `*Ответ сформирован на основе базы знаний (режим без нейросети)*`;
    return response;
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
                    text: '🔍 Я загружаю базу знаний с форума АСУТП. Задайте вопрос по оборудованию!',
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
                text: '🔍 Задайте вопрос по оборудованию. Я поищу в базе знаний АСУТП!',
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
    
    const profilePlanName = document.getElementById('profilePlanName');
    if (profilePlanName && currentUser) {
        const userData = users[currentUser.login];
        if (userData) {
            const planName = userData.plan === 'basic' ? 'Базовый (100 запросов)' : 
                            (userData.plan === 'pro' ? 'Профессиональный' : 'Корпоративный');
            profilePlanName.textContent = planName;
        }
    }
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

// ========== ТЕСТ-ДРАЙВ (1 бесплатный запрос) ==========

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

// ========== ОСТАЛЬНЫЕ ФУНКЦИИ (БИРЖА, ОПЛАТА И Т.Д.) ==========
// (все функции из вашего исходного кода остаются без изменений)

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

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница загружена, инициализация...');
    
    checkAuth();
    
    // Загружаем базу знаний в фоне
    loadKnowledgeBase();
    
    // Если мы на странице тест-драйва, инициализируем чат
    if (window.location.pathname.includes('test.html')) {
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
    
    // Если мы на странице профиля, загружаем историю
    if (window.location.pathname.includes('profile.html')) {
        loadUserChatHistory();
    }
    
    // Если мы на странице биржи, загружаем данные
    if (window.location.pathname.includes('marketplace.html')) {
        loadMarketplaceData();
    }
});

// Добавляем функции биржи из вашего исходного кода сюда
// (equipmentData, loadMarketplaceData, switchMarketplaceTab, addNewItem, loadSellerItems, openBuyModal, closeModal, submitPhone)
