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

// ========== БАЗА ЗНАНИЙ (обновлённая версия) ==========
let knowledgeBase = [];
let isBaseLoaded = false;

// Функция для разбора CSV с учетом кавычек и запятых внутри
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
    result.push(current.trim()); // последнее поле
    
    return result;
}

// Загрузка базы знаний из сжатого .gz файла
async function loadKnowledgeBase() {
    if (isBaseLoaded) return true;
    
    try {
        console.log('📚 Загрузка базы знаний...');
        
        // Пытаемся загрузить сжатый файл с GitHub
        const response = await fetch('https://raw.githubusercontent.com/lordvako/industrai/main/knowledge_base_clean.csv.gz');
        
        if (!response.ok) {
            console.log('⚠️ Файл не найден на GitHub, пробуем локально...');
            // Пробуем локально
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
        
        // Парсим CSV построчно
        const lines = csvText.split('\n');
        const headers = parseCSVLine(lines[0]);
        
        console.log('📋 Заголовки CSV:', headers);
        
        knowledgeBase = [];
        
        // Ограничиваем для производительности (первые 3000 записей)
        const maxLines = Math.min(lines.length, 3000);
        
        for (let i = 1; i < maxLines; i++) {
            if (!lines[i].trim()) continue;
            
            const values = parseCSVLine(lines[i]);
            const obj = {};
            
            headers.forEach((header, index) => {
                // Очищаем значения от кавычек
                let value = values[index] || '';
                value = value.replace(/^"|"$/g, ''); // убираем внешние кавычки
                obj[header] = value;
            });
            
            // Проверяем, есть ли полезное содержание
            if (obj.content && obj.content.length > 50) {
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
        .map(term => term.replace(/[^\wа-яё]/gi, '')); // убираем спецсимволы
    
    if (searchTerms.length === 0) return [];
    
    const results = [];
    const seenContents = new Set();
    
    for (const item of knowledgeBase) {
        let relevance = 0;
        let matchedTerms = [];
        let matchedText = '';
        
        // Объединяем все текстовые поля для поиска
        const searchableText = [
            item.topic_title || '',
            item.content || '',
            item.solution || '',
            item.manufacturer || '',
            item.forum || ''
        ].join(' ').toLowerCase();
        
        for (const term of searchTerms) {
            if (term.length < 2) continue;
            
            // Точное совпадение термина
            if (searchableText.includes(term)) {
                // Увеличиваем релевантность в зависимости от того, где найдено
                if (item.topic_title?.toLowerCase().includes(term)) relevance += 10;
                else if (item.solution?.toLowerCase().includes(term)) relevance += 8;
                else if (item.content?.toLowerCase().includes(term)) relevance += 5;
                else if (item.manufacturer?.toLowerCase().includes(term)) relevance += 4;
                else relevance += 3;
                
                matchedTerms.push(term);
                matchedText += term + ' ';
            }
            
            // Поиск по кодам ошибок (F01, F04, ALARM, и т.д.)
            if (/f\d{2}|alarm|error|ошибк/i.test(term)) {
                const errorPattern = new RegExp(term, 'i');
                if (errorPattern.test(searchableText)) {
                    relevance += 15; // Очень высокий приоритет для кодов ошибок
                    matchedTerms.push(term + '(код ошибки)');
                }
            }
        }
        
        // Убираем дубликаты по содержанию
        const contentKey = (item.content || '').substring(0, 100);
        if (relevance > 5 && !seenContents.has(contentKey)) {
            seenContents.add(contentKey);
            results.push({
                item: item,
                relevance: relevance,
                matchedTerms: [...new Set(matchedTerms)],
                matchedText: matchedText.trim()
            });
        }
    }
    
    // Сортируем по релевантности
    results.sort((a, b) => b.relevance - a.relevance);
    
    // Возвращаем топ-5 результатов
    return results.slice(0, 5);
}

// Формирование красивого ответа
function formatKnowledgeResponse(results, query) {
    if (results.length === 0) {
        return `❌ **Ничего не найдено по запросу "${query}"**

Попробуйте:
• Уточнить запрос (например, "SEW F04" или "Siemens ошибка SF")
• Использовать более короткие ключевые слова
• Проверить правильность кода ошибки

Или задайте вопрос по-другому.`;
    }
    
    let response = `🔍 **Нашёл в базе знаний (${results.length} записей):**\n\n`;
    
    results.forEach((result, index) => {
        const item = result.item;
        
        // Заголовок с производителем
        let manufacturer = item.manufacturer || 'другое';
        if (manufacturer === 'other') manufacturer = 'общее';
        
        response += `📌 **Результат ${index + 1}** `;
        if (manufacturer) response += `[${manufacturer.toUpperCase()}]`;
        response += `\n`;
        
        // Тема
        if (item.topic_title) {
            let title = item.topic_title;
            if (title.length > 80) title = title.substring(0, 80) + '...';
            response += `📋 **Тема:** ${title}\n`;
        }
        
        // Раздел форума
        if (item.forum && item.forum !== 'undefined') {
            response += `📂 **Раздел:** ${item.forum}\n`;
        }
        
        response += `\n`;
        
        // Описание проблемы (сокращаем)
        if (item.content && item.content.length > 10) {
            let content = item.content;
            if (content.length > 300) content = content.substring(0, 300) + '...';
            response += `💬 **Вопрос:**\n${content}\n\n`;
        }
        
        // Решение (самое важное)
        if (item.solution && item.solution.length > 10 && item.solution !== item.content) {
            let solution = item.solution;
            if (solution.length > 400) solution = solution.substring(0, 400) + '...';
            response += `✅ **Решение:**\n${solution}\n\n`;
        }
        
        // Ключевые слова
        if (result.matchedTerms.length > 0) {
            response += `🔑 *Найдено по: ${result.matchedTerms.join(', ')}*\n`;
        }
        
        response += `---\n\n`;
    });
    
    response += `\n*Ответ сформирован на основе реальных сообщений с форума АСУТП*`;
    
    return response;
}

// ========== ОСНОВНАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ОТВЕТА ==========
async function getAIResponse(query) {
    // Ждем загрузки базы знаний
    if (!isBaseLoaded) {
        await loadKnowledgeBase();
    }
    
    // Ищем в базе знаний
    const results = searchKnowledgeBase(query);
    
    // Формируем ответ
    return formatKnowledgeResponse(results, query);
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
    let html = '';
    chat.messages.forEach(msg => {
        // Форматируем текст сообщения (заменяем переносы строк на <br>)
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
    
    // Обновляем название плана
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
    if (!currentUser) {
        alert('Необходимо авторизоваться');
        return;
    }
    
    const input = document.getElementById('profileChatInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    const chat = chatHistory[currentUser.login].find(c => c.id === currentChatId);
    if (!chat) return;
    
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
        text: '🔍 Ищу в базе знаний форума АСУТП...',
        timestamp: new Date().toISOString()
    });
    loadProfileChat(currentChatId);
    
    // Получаем ответ от базы знаний
    setTimeout(async () => {
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        // Получаем ответ
        const reply = await getAIResponse(msg);
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
        loadProfileChat(currentChatId);
    }, 500);
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
                text: '🔍 Задайте вопрос. Я поищу в базе знаний АСУТП!',
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
    const input = document.getElementById('testChatInput');
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
    if (!chat) return;
    
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
        text: '🔍 Ищу в базе знаний...',
        timestamp: new Date().toISOString()
    });
    loadTestChat(testCurrentChatId);
    
    // Получаем ответ от базы знаний
    setTimeout(async () => {
        // Удаляем индикатор загрузки
        chat.messages.pop();
        
        // Получаем ответ
        const reply = await getAIResponse(msg);
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        loadTestChat(testCurrentChatId);
    }, 500);
}

// ========== ОСТАЛЬНЫЕ ФУНКЦИИ (без изменений) ==========
// showConfirm, processPayment, loadMarketplaceData, и т.д. 
// остаются такими же, как в вашем исходном коде
// [вставьте сюда остальные функции из вашего файла]
