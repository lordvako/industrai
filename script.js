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

// Конфигурация DeepSeek API
const DEEPSEEK_CONFIG = {
    apiKey: 'sk-6f2c9043acad4e278f5a3a230a1b5e33', // Ваш ключ DeepSeek
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
                // Чем больше совпадений, тем выше релевантность
                relevance += searchableText.split(term).length - 1;
            }
            
            // Коды ошибок дают бонус
            if (/f\d{2}|alarm|error|ошибк/i.test(term)) {
                if (searchableText.includes(term)) {
                    relevance += 5;
                }
            }
        }
        
        const contentKey = (item.content || '').substring(0, 150);
        if (relevance > 0 && !seenContents.has(contentKey)) {
            seenContents.add(contentKey);
            results.push({
                item: item,
                relevance: relevance
            });
        }
    }
    
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, 7); // Берём 7 лучших для контекста
}

// Формирование промпта для DeepSeek
function buildPrompt(query, results) {
    let context = '';
    let manufacturers = new Set();
    
    results.forEach((result, index) => {
        const item = result.item;
        if (item.manufacturer && item.manufacturer !== 'other') {
            manufacturers.add(item.manufacturer);
        }
        
        context += `--- ИСТОЧНИК ${index + 1} ---\n`;
        if (item.topic_title) {
            context += `Тема: ${item.topic_title}\n`;
        }
        if (item.content && item.content.length > 20) {
            let cleanContent = item.content
                .replace(/\[quote=.*?\]/gi, '')
                .replace(/\[\/quote\]/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            context += `Содержание: ${cleanContent.substring(0, 500)}\n`;
        }
        if (item.solution && item.solution.length > 20 && item.solution !== item.content) {
            let cleanSolution = item.solution
                .replace(/\[quote=.*?\]/gi, '')
                .replace(/\[\/quote\]/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            context += `Возможное решение: ${cleanSolution.substring(0, 500)}\n`;
        }
        context += '\n';
    });
    
    const manufacturerList = Array.from(manufacturers).join(', ');
    
    const prompt = `Ты — опытный инженер по промышленной автоматизации с 20-летним стажем. Твоя задача — помочь пользователю решить проблему с оборудованием.

У тебя есть два источника знаний:
1. Твой собственный опыт и знания (ты эксперт)
2. Дополнительная база знаний из реальных сообщений с форума АСУТП (приведена ниже)

Проанализируй вопрос пользователя и найденные сообщения с форума. Дай понятный, полезный ответ, как опытный инженер.

ВАЖНЫЕ ПРАВИЛА:
1. Отвечай кратко, по делу, профессионально
2. Если в сообщениях с форума есть полезная информация — используй её
3. Если информации недостаточно — добавь свои знания
4. Всегда указывай конкретные шаги: что проверить, что сделать
5. Если проблема решаема — напиши чёткий алгоритм действий
6. Не упоминай "согласно источникам" или "как сказано в сообщениях" — просто дай ответ

${manufacturerList ? `Проблема связана с оборудованием: ${manufacturerList}` : ''}

ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ С ФОРУМА:
${context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${query}

ТВОЙ ОТВЕТ (как инженер-эксперт, используй свой опыт и данные выше):`;
    
    return prompt;
}

// Запрос к DeepSeek API
async function askDeepSeek(prompt) {
    try {
        console.log('🤖 Отправка запроса к DeepSeek...');
        
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
                        content: 'Ты эксперт по промышленной автоматизации с 20-летним стажем. Отвечай кратко, профессионально, по делу.'
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
            const errorText = await response.text();
            console.error('Ошибка DeepSeek API:', response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Ответ получен от DeepSeek');
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('Ошибка при обращении к DeepSeek:', error);
        return null;
    }
}

// Резервный вариант (если DeepSeek не отвечает)
function getFallbackAnswer(query, results) {
    if (results.length === 0) {
        return `❌ По вашему запросу "${query}" ничего не найдено в базе знаний.\n\nПопробуйте уточнить запрос (например, указать модель оборудования и код ошибки).`;
    }
    
    // Ищем лучшее решение в базе
    let bestMatch = results[0];
    const item = bestMatch.item;
    
    let answer = `🔍 На основе базы знаний нашёл информацию по вашему запросу:\n\n`;
    
    if (item.solution && item.solution.length > 50) {
        answer += item.solution.substring(0, 1000);
    } else if (item.content && item.content.length > 50) {
        answer += item.content.substring(0, 1000);
    } else {
        answer += `Найдена тема: ${item.topic_title || 'без названия'}`;
    }
    
    answer += `\n\n---\n*Ответ сформирован на основе базы знаний (DeepSeek временно недоступен)*`;
    return answer;
}

// Основная функция для получения ответа
async function getAIResponse(query) {
    if (!isBaseLoaded) {
        await loadKnowledgeBase();
    }
    
    // Ищем в базе знаний
    const results = searchKnowledgeBase(query);
    
    // Формируем промпт с контекстом из базы
    const prompt = buildPrompt(query, results);
    
    // Отправляем DeepSeek
    const deepseekAnswer = await askDeepSeek(prompt);
    
    if (deepseekAnswer) {
        return deepseekAnswer;
    }
    
    // Если DeepSeek не ответил, используем резервный вариант
    console.log('⚠️ DeepSeek не отвечает, переходим в резервный режим');
    return getFallbackAnswer(query, results);
}

// ========== ФУНКЦИИ ДЛЯ ЧАТА ==========
// (все функции чата остаются без изменений - loadUserChatHistory, renderProfileHistory, 
// createNewProfileChat, loadProfileChat, sendProfileMessage, deleteChat)

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
        text: '🔍 Анализирую базу знаний и готовлю ответ...',
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

// ========== ОСТАЛЬНЫЕ ФУНКЦИИ (биржа, оплата и т.д.) ==========
// (здесь все ваши остальные функции - equipmentData, loadMarketplaceData, 
// switchMarketplaceTab, openBuyModal, closeModal, submitPhone, checkAuth, logout и т.д.)

// Для краткости я не копирую их, но они остаются без изменений
// Добавьте сюда все функции из вашего исходного кода
