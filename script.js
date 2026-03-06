// ========== СИСТЕМА ПОЛЬЗОВАТЕЛЕЙ ==========

let users = JSON.parse(localStorage.getItem('industrai_users')) || {};

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
let chatHistory = JSON.parse(localStorage.getItem('industrai_chat_history')) || {};

// ========== БАЗА ЗНАНИЙ ==========
let knowledgeBase = [];
let isBaseLoaded = false;

// ========== КОНФИГУРАЦИЯ OPENROUTER ==========
const AI_CONFIG = {
    apiKey: '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',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-chat',
    siteUrl: window.location.origin,
    siteName: 'IndustrAI'
};

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

async function loadKnowledgeBase() {
    if (isBaseLoaded) return true;
    
    try {
        console.log('📚 Загрузка базы знаний...');
        
        const response = await fetch('https://raw.githubusercontent.com/lordvako/industrai/main/knowledge_base_clean.csv.gz');
        
        if (!response.ok) {
            throw new Error('Не удалось загрузить базу знаний');
        }
        
        const blob = await response.blob();
        const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        const decompressedBlob = await new Response(decompressedStream).blob();
        const csvText = await decompressedBlob.text();
        
        const lines = csvText.split('\n');
        const headers = parseCSVLine(lines[0]);
        
        knowledgeBase = [];
        
        for (let i = 1; i < Math.min(lines.length, 2000); i++) {
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
                relevance += searchableText.split(term).length - 1;
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
    return results.slice(0, 5);
}

function buildPrompt(query, results) {
    let context = '';
    
    results.forEach((result, index) => {
        const item = result.item;
        context += `--- ИСТОЧНИК ${index + 1} ---\n`;
        if (item.manufacturer && item.manufacturer !== 'other') {
            context += `Производитель: ${item.manufacturer}\n`;
        }
        if (item.solution && item.solution.length > 20) {
            context += `Решение: ${item.solution.substring(0, 500)}\n`;
        } else if (item.content && item.content.length > 20) {
            context += `Содержание: ${item.content.substring(0, 500)}\n`;
        }
        context += '\n';
    });
    
    return `Ты — опытный инженер по промышленной автоматизации с 20-летним стажем. Помоги пользователю решить проблему.

ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ (если они полезны):
${context}

ВОПРОС: ${query}

ТВОЙ ОТВЕТ (кратко, профессионально, конкретные шаги):`;
}

async function askAI(prompt) {
    try {
        console.log('🤖 Отправка запроса к OpenRouter...');
        
        const response = await fetch(AI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'HTTP-Referer': AI_CONFIG.siteUrl,
                'X-Title': AI_CONFIG.siteName
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Ты эксперт по промышленной автоматизации. Отвечай кратко, профессионально, по делу.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 600
            })
        });
        
        // Логируем статус для отладки
        console.log('📡 Статус ответа OpenRouter:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Ошибка OpenRouter:', response.status, errorText);
            
            // Показываем ошибку пользователю
            showNotification(`Ошибка API: ${response.status}. Использую локальную базу.`);
            return null;
        }
        
        const data = await response.json();
        console.log('✅ Ответ получен от OpenRouter');
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('❌ Ошибка сети:', error);
        showNotification('Ошибка сети. Использую локальную базу.');
        return null;
    }
}

async function getAIResponse(query) {
    if (!isBaseLoaded) await loadKnowledgeBase();
    
    const results = searchKnowledgeBase(query);
    const prompt = buildPrompt(query, results);
    const answer = await askAI(prompt);
    
    if (answer) return answer;
    
    // Умный резервный ответ на основе базы
    if (results.length > 0) {
        let combinedAnswer = "🔍 **На основе базы знаний нашёл несколько сообщений по вашей теме:**\n\n";
        
        results.slice(0, 3).forEach((result, i) => {
            const item = result.item;
            combinedAnswer += `📌 **Вариант ${i+1}**\n`;
            if (item.solution && item.solution.length > 50) {
                combinedAnswer += item.solution.substring(0, 300) + "...\n\n";
            } else if (item.content && item.content.length > 50) {
                combinedAnswer += item.content.substring(0, 300) + "...\n\n";
            }
        });
        
        combinedAnswer += "---\n_Попробуйте уточнить запрос или задать вопрос иначе._";
        return combinedAnswer;
    }
    
    return `❌ По запросу "${query}" ничего не найдено в базе знаний. Попробуйте изменить запрос.`;
}

// ========== ТЕСТОВАЯ ФУНКЦИЯ ==========
async function testOpenRouter() {
    console.log('🔍 Тестирование OpenRouter API...');
    
    try {
        const response = await fetch(AI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'HTTP-Referer': AI_CONFIG.siteUrl,
                'X-Title': AI_CONFIG.siteName
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    { role: 'user', content: 'Say "OK" if you are working' }
                ],
                max_tokens: 10
            })
        });
        
        console.log('📡 Статус теста:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Тест не пройден:', errorText);
            showNotification(`⚠️ OpenRouter API не отвечает (${response.status}). Используется локальный режим.`);
            return false;
        }
        
        const data = await response.json();
        console.log('✅ OpenRouter работает:', data.choices[0].message.content);
        showNotification('✅ Подключение к нейросети установлено!');
        return true;
        
    } catch (error) {
        console.error('❌ Ошибка теста:', error);
        showNotification('⚠️ Нет подключения к нейросети. Используется локальный режим.');
        return false;
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
        
        if (subscriptionBanner) subscriptionBanner.style.display = 'block';
        
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
        
        if (subscriptionBanner) subscriptionBanner.style.display = 'none';
        
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

// ========== ФУНКЦИИ ДЛЯ ЧАТА ==========

function loadUserChatHistory() {
    if (!currentUser) return;
    
    if (!chatHistory[currentUser.login]) chatHistory[currentUser.login] = [];
    
    if (chatHistory[currentUser.login].length === 0) {
        chatHistory[currentUser.login].push({
            id: Date.now(),
            title: 'Новый диалог',
            messages: [{
                sender: 'bot',
                text: '🔍 База знаний загружена. Задайте вопрос по оборудованию!',
                timestamp: new Date().toISOString()
            }],
            createdAt: new Date().toISOString()
        });
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
    
    let html = '';
    chatHistory[currentUser.login].forEach(chat => {
        html += `
            <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" onclick="loadProfileChat(${chat.id})">
                <div class="history-item-title">${chat.title}</div>
                <div class="history-item-date">${new Date(chat.createdAt).toLocaleDateString('ru-RU')}</div>
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
        messages: [{
            sender: 'bot',
            text: '🔍 Задайте вопрос по оборудованию!',
            timestamp: new Date().toISOString()
        }],
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
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">${msg.text.replace(/\n/g, '<br>')}</div>
            </div>
        `;
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendProfileMessage() {
    if (!currentUser) { alert('Необходимо авторизоваться'); return; }
    
    const input = document.getElementById('profileChatInput');
    if (!input) return;
    
    const msg = input.value.trim();
    if (!msg) return;
    
    const chat = chatHistory[currentUser.login].find(c => c.id === currentChatId);
    if (!chat) return;
    
    chat.messages.push({ sender: 'user', text: msg, timestamp: new Date().toISOString() });
    if (chat.messages.length === 2) chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    
    loadProfileChat(currentChatId);
    input.value = '';
    
    chat.messages.push({ sender: 'bot', text: '🔍 Анализирую...', timestamp: new Date().toISOString() });
    loadProfileChat(currentChatId);
    
    const reply = await getAIResponse(msg);
    chat.messages.pop();
    chat.messages.push({ sender: 'bot', text: reply, timestamp: new Date().toISOString() });
    
    localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
    loadProfileChat(currentChatId);
}

function deleteChat(chatId, event) {
    event.stopPropagation();
    if (!currentUser) return;
    if (!confirm('Удалить этот диалог?')) return;
    
    chatHistory[currentUser.login] = chatHistory[currentUser.login].filter(c => c.id !== chatId);
    localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
    
    if (chatHistory[currentUser.login].length === 0) {
        createNewProfileChat();
    } else {
        renderProfileHistory();
        loadProfileChat(chatHistory[currentUser.login][0].id);
    }
}

// ========== ТЕСТ-ДРАЙВ ==========

let testQueriesLeft = 1;
let testChatHistory = [];
let testCurrentChatId = null;

function createNewTestChat() {
    testChatHistory.push({
        id: Date.now(),
        title: 'Новый диалог',
        messages: [{
            sender: 'bot',
            text: '🔍 У вас 1 бесплатный запрос. Задайте вопрос по оборудованию!',
            timestamp: new Date().toISOString()
        }],
        createdAt: new Date().toISOString()
    });
    renderTestHistory();
    loadTestChat(testChatHistory[testChatHistory.length-1].id);
}

function renderTestHistory() {
    const historyList = document.getElementById('testHistoryList');
    if (!historyList) return;
    
    let html = '';
    testChatHistory.forEach(chat => {
        html += `
            <div class="history-item ${chat.id === testCurrentChatId ? 'active' : ''}" onclick="loadTestChat(${chat.id})">
                <div class="history-item-title">${chat.title}</div>
                <div class="history-item-date">${new Date(chat.createdAt).toLocaleDateString('ru-RU')}</div>
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
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">${msg.text.replace(/\n/g, '<br>')}</div>
            </div>
        `;
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendTestMessage() {
    const input = document.getElementById('testChatInput');
    if (!input) return;
    
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
    
    chat.messages.push({ sender: 'user', text: msg, timestamp: new Date().toISOString() });
    if (chat.messages.length === 2) chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    
    loadTestChat(testCurrentChatId);
    input.value = '';
    
    chat.messages.push({ sender: 'bot', text: '🔍 Анализирую...', timestamp: new Date().toISOString() });
    loadTestChat(testCurrentChatId);
    
    const reply = await getAIResponse(msg);
    chat.messages.pop();
    chat.messages.push({ sender: 'bot', text: reply, timestamp: new Date().toISOString() });
    loadTestChat(testCurrentChatId);
}

// ========== БИРЖА ==========

const equipmentData = [
    { id:1, name:"Контроллер wieland SP-COP2-EN-A DC 24V -R1.190.121", category:"Контроллеры", description:"НОВОЕ, В НАЛИЧИИ", image:"⚙️", sellerPrice:320000, finalPrice:432000, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:2, name:"Модуль вывода siemens 6ES7331-1KF02-0AB0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:3, name:"Модуль ввода siemens 6ES7322-1BL00-0AA0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:4, name:"Интерфейсный модуль siemens 6ES7153-2BA10-0XB0", category:"Интерфейсные модули", description:"НОВОЕ, В НАЛИЧИИ", image:"📡", sellerPrice:75000, finalPrice:101250, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:5, name:"Модуль вх/вых SP-sdio84-P1-K-A Wieland", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:110000, finalPrice:148500, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:6, name:"Модуль вывода siemens 6ES7332-5HF00-0AB0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" }
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
}

let currentItemId = null;

function openBuyModal(id) { currentItemId = id; document.getElementById('phoneModal')?.classList.add('active'); }
function closeModal() { document.getElementById('phoneModal')?.classList.remove('active'); document.getElementById('buyerPhone').value = ''; }

function submitPhone() {
    const phone = document.getElementById('buyerPhone').value;
    if (!phone) { alert('Введите телефон'); return; }
    showNotification('Спасибо! Мы свяжемся с вами');
    closeModal();
}

function showNotification(msg) {
    const n = document.createElement('div');
    n.className = 'notification';
    n.innerHTML = `<i class="fas fa-check-circle" style="color:#00B4A0; margin-right:8px"></i>${msg}`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu')?.classList.toggle('active');
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadKnowledgeBase();
    testOpenRouter(); // Тестируем подключение
    
    const path = window.location.pathname;
    if (path.includes('test.html')) {
        testQueriesLeft = 1;
        document.getElementById('testQueryCounter') && (document.getElementById('testQueryCounter').innerText = '1 запрос');
        createNewTestChat();
    }
    if (path.includes('profile.html')) loadUserChatHistory();
    if (path.includes('marketplace.html')) loadMarketplaceData();
});
