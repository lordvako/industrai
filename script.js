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

// ========== БАЗА ОБОРУДОВАНИЯ ДЛЯ МАРКЕТПЛЕЙСА ==========
const equipmentData = [
    { id:1, name:"Контроллер wieland SP-COP2-EN-A DC 24V -R1.190.121", category:"Контроллеры", description:"НОВОЕ, В НАЛИЧИИ", image:"⚙️", sellerPrice:320000, finalPrice:432000, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:2, name:"Модуль вывода siemens 6ES7331-1KF02-0AB0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:3, name:"Модуль ввода siemens 6ES7322-1BL00-0AA0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:4, name:"Интерфейсный модуль siemens 6ES7153-2BA10-0XB0", category:"Интерфейсные модули", description:"НОВОЕ, В НАЛИЧИИ", image:"📡", sellerPrice:75000, finalPrice:101250, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:5, name:"Модуль вх/вых SP-sdio84-P1-K-A Wieland", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:110000, finalPrice:148500, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:6, name:"Модуль вывода siemens 6ES7332-5HF00-0AB0", category:"Модули", description:"НОВОЕ, В НАЛИЧИИ", image:"🔌", sellerPrice:56000, finalPrice:75600, status:"НОВОЕ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:7, name:"Инвертор Inovance MD380 5.5kW", category:"Инверторы", description:"Б/У, РАБОЧИЙ", image:"⚡", sellerPrice:25000, finalPrice:33750, status:"Б/У, ГАРАНТИЯ 1 МЕС", sellerName:"Василий" },
    { id:8, name:"Частотный преобразователь Kossi K1-4050 4kW", category:"Инверторы", description:"НОВЫЙ", image:"⚡", sellerPrice:18000, finalPrice:24300, status:"НОВЫЙ, В НАЛИЧИИ", sellerName:"Василий" },
    { id:9, name:"Mitsubishi D700 0.75kW", category:"Инверторы", description:"НОВЫЙ", image:"⚡", sellerPrice:15000, finalPrice:20250, status:"ПОД ЗАКАЗ", sellerName:"Василий" }
];

// ========== GROQ API ЧЕРЕЗ CLOUDFLARE WORKER ==========
const WORKER_URL = 'https://industrai-api.neprostoj-zen.workers.dev/';

async function callFreeAIAPI(messages) {
    try {
        console.log('📤 Отправка запроса к Worker...', messages);
        
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: messages })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('❌ Ошибка HTTP:', response.status, errText);
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('✅ Получен ответ от Worker:', data);

        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return formatAIResponse(data.choices[0].message.content);
        } else {
            throw new Error('Некорректный формат ответа от API');
        }

    } catch (error) {
        console.error('❌ AI Error:', error);
        return '⚠️ **Ошибка соединения с нейросетью**\n\n' + 
               'Техническая информация: ' + error.message;
    }
}

// Форматирование ответа нейросети
function formatAIResponse(text) {
    if (!text) return '⚠️ Нет ответа от нейросети';
    
    let formatted = text;
    
    formatted = formatted.replace(/##\s*(.+)/g, '<div class="ai-section-header"><i class="fas fa-info-circle"></i> $1</div>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/^-\s+(.+)$/gm, '<div class="ai-bullet"><i class="fas fa-check-circle"></i><span>$1</span></div>');
    formatted = formatted.replace(/^•\s+(.+)$/gm, '<div class="ai-bullet"><i class="fas fa-cog"></i><span>$1</span></div>');
    formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<div class="ai-step"><span class="step-number">→</span><span class="step-text">$1</span></div>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(/Важно:/gi, '⚠️ <strong>Важно:</strong>');
    formatted = formatted.replace(/Совет:/gi, '💡 <strong>Совет:</strong>');
    formatted = formatted.replace(/\n\n/g, '<div class="ai-divider"></div>');
    formatted = formatted.replace(/\n/g, '<br>');
    formatted = formatted.replace(/<\/div><br>/g, '</div>');
    formatted = formatted.replace(/<br><div class="ai-divider">/g, '<div class="ai-divider">');
    
    return `<div class="ai-response expert-response">${formatted}</div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ПОИСК В БАЗЕ ДАННЫХ НА JINO.RU ==========
async function searchInLocalDatabase(query) {
    if (!query || !query.trim()) return null;
    
    try {
        console.log('🔍 Поиск в базе данных Jino.ru:', query);
        
        const response = await fetch(`search_forum.php?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            console.warn('Ошибка ответа от сервера:', response.status);
            return null;
        }
        
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка от сервера:', data.error);
            return null;
        }
        
        if (!data || data.length === 0) {
            console.log('Ничего не найдено в базе');
            return null;
        }
        
        console.log(`Найдено ${data.length} результатов в базе`);
        
        let resultHtml = '';
        for (const item of data) {
            const problemShort = item.problem && item.problem.length > 150 ? item.problem.substring(0, 150) + '...' : (item.problem || 'Проблема');
            
            resultHtml += `
                <div class="forum-item">
                    <div class="forum-question"><i class="fas fa-question-circle"></i> ${escapeHtml(problemShort)}</div>
                    <div class="forum-answer"><i class="fas fa-comment-dots"></i> ${escapeHtml(item.solution)}</div>
                    ${item.manufacturer ? `<div class="forum-meta"><i class="fas fa-tag"></i> Производитель: ${escapeHtml(item.manufacturer)}</div>` : ''}
                    ${item.error_code ? `<div class="forum-meta"><i class="fas fa-code"></i> Код ошибки: ${escapeHtml(item.error_code)}</div>` : ''}
                </div>
            `;
        }
        
        return resultHtml;
        
    } catch (error) {
        console.error('❌ Ошибка при поиске в локальной БД:', error);
        return null;
    }
}

// ========== ПОИСК ПО МАРКЕТПЛЕЙСУ ==========
function searchInMarketplace(query) {
    if (!query || !query.trim()) return null;
    
    const lowerQuery = query.toLowerCase();
    let foundItems = [];
    
    for (const item of equipmentData) {
        const searchable = `${item.name} ${item.category} ${item.description} ${item.status}`.toLowerCase();
        if (searchable.includes(lowerQuery)) {
            foundItems.push(item);
        }
    }
    
    if (foundItems.length === 0) return null;
    
    let resultHtml = '<div class="marketplace-results">';
    resultHtml += '<div class="db-header"><i class="fas fa-store"></i> 🛒 Найдено в каталоге оборудования:</div>';
    
    foundItems.forEach(item => {
        resultHtml += `
            <div class="marketplace-item" onclick="openBuyModal(${item.id})">
                <div class="marketplace-icon">${item.image}</div>
                <div class="marketplace-info">
                    <div class="marketplace-name">${escapeHtml(item.name)}</div>
                    <div class="marketplace-price">💰 ${item.finalPrice.toLocaleString()} ₽</div>
                    <div class="marketplace-status">${item.status}</div>
                </div>
                <button class="marketplace-buy">Купить</button>
            </div>
        `;
    });
    resultHtml += '</div>';
    
    return resultHtml;
}

// ========== ГЛАВНАЯ ФУНКЦИЯ ГИБРИДНОГО ОТВЕТА ==========
async function getHybridResponse(userMessage, chat, isTestMode = false) {
    
    const systemPrompt = `Ты — ведущий инженер-эксперт по промышленной автоматизации (АСУТП) с 20-летним стажем.
Ты отвечаешь на любые технические вопросы пользователей по промышленному оборудованию: частотные преобразователи, PLC, приводы, инверторы, сенсоры, контроллеры.
Твои знания включают все бренды: Siemens, SEW, Yaskawa, Mitsubishi, Inovance, Kossi, Delta, Wieland, Schneider, Omron, Rockwell, ABB и другие.

ПРАВИЛА ОТВЕТА:
1. Отвечай максимально подробно, профессионально и полезно.
2. Используй структуру: сначала короткая диагностика, потом причины, потом пошаговые решения.
3. Если не знаешь точного ответа — честно скажи и дай общие рекомендации.
4. Будь дружелюбным и понятным для инженеров любого уровня.

ВАЖНО: Ты можешь использовать свои знания, полученные при обучении. Отвечай свободно, как технический эксперт.`;
    
    const messageHistory = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
    ];
    
    let aiReply = await callFreeAIAPI(messageHistory);
    
    console.log('🔍 Запускаю поиск в локальной базе данных...');
    const forumResult = await searchInLocalDatabase(userMessage);
    
    if (forumResult) {
        aiReply += `<div class="ai-divider"></div>
<div class="hybrid-header"><i class="fas fa-database"></i> 📚 ДОПОЛНИТЕЛЬНО: Найдено в локальной базе знаний (форумы):</div>
${forumResult}`;
    } else {
        aiReply += `<div class="ai-divider"></div>
<div class="no-results-message">
    <i class="fas fa-database"></i> 
    <strong>📭 В локальной базе данных совпадений не найдено</strong><br>
    <span class="no-results-hint">Этот ответ сформирован только на основе знаний нейросети.</span>
</div>`;
    }
    
    const marketplaceResult = searchInMarketplace(userMessage);
    if (marketplaceResult) {
        aiReply += `<div class="ai-divider"></div>${marketplaceResult}`;
    }
    
    return aiReply;
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
                text: '🤖 Я — технический эксперт по промышленной автоматизации. Задавайте любые вопросы! А после моего ответа я проверю нашу локальную базу знаний с форумов и каталог оборудования.',
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
                <div class="history-item-title">${escapeHtml(chat.title)}</div>
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
            text: '🤖 Задайте любой технический вопрос — я отвечу как эксперт, а потом проверю локальную базу знаний!',
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
                <div class="message-avatar">${msg.sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}</div>
                <div class="message-content">${msg.text}</div>
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
    
    chat.messages.push({ 
        sender: 'user', 
        text: `<div class="user-message">${escapeHtml(msg)}</div>`, 
        timestamp: new Date().toISOString() 
    });
    
    if (chat.messages.length === 2) {
        chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    }
    
    loadProfileChat(currentChatId);
    input.value = '';
    
    chat.messages.push({ 
        sender: 'bot', 
        text: '<div class="thinking"><i class="fas fa-spinner fa-pulse"></i> Анализирую вопрос и проверяю базу...</div>', 
        timestamp: new Date().toISOString() 
    });
    loadProfileChat(currentChatId);
    
    const reply = await getHybridResponse(msg, chat, false);
    
    chat.messages.pop();
    chat.messages.push({ 
        sender: 'bot', 
        text: reply, 
        timestamp: new Date().toISOString() 
    });
    
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
            text: '🔍 Бесплатный тест-драйв. Я отвечу как эксперт, а потом проверю локальную базу знаний!',
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
                <div class="history-item-title">${escapeHtml(chat.title)}</div>
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
                <div class="message-avatar">${msg.sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}</div>
                <div class="message-content">${msg.text}</div>
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
    if (counter) counter.innerText = testQueriesLeft + ' запрос' + (testQueriesLeft !== 1 ? 'а' : '');
    
    const chat = testChatHistory.find(c => c.id === testCurrentChatId);
    if (!chat) return;
    
    chat.messages.push({ sender: 'user', text: `<div class="user-message">${escapeHtml(msg)}</div>`, timestamp: new Date().toISOString() });
    if (chat.messages.length === 2) chat.title = msg.substring(0, 30) + (msg.length > 30 ? '...' : '');
    
    loadTestChat(testCurrentChatId);
    input.value = '';
    
    chat.messages.push({ sender: 'bot', text: '<div class="thinking"><i class="fas fa-spinner fa-pulse"></i> Анализирую...</div>', timestamp: new Date().toISOString() });
    loadTestChat(testCurrentChatId);
    
    const reply = await getHybridResponse(msg, chat, true);
    
    chat.messages.pop();
    chat.messages.push({ sender: 'bot', text: reply, timestamp: new Date().toISOString() });
    loadTestChat(testCurrentChatId);
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

// ========== БИРЖА (МАРКЕТПЛЕЙС) ==========

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
                    <div class="item-title">${escapeHtml(item.name)}</div>
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
    const isAdmin = currentUser && currentUser.login === 'admin';
    
    document.querySelectorAll('.tab-button').forEach((btn, i) => {
        btn.classList.toggle('active', 
            (i === 0 && tab === 'catalog') ||
            (i === 1 && tab === 'add') ||
            (i === 2 && tab === 'cabinet' && isAdmin)
        );
    });
    
    document.querySelectorAll('.tab-content').forEach((content, i) => {
        content.classList.toggle('active', 
            (i === 0 && tab === 'catalog') ||
            (i === 1 && tab === 'add') ||
            (i === 2 && tab === 'cabinet')
        );
    });
    
    if (tab === 'cabinet' && isAdmin) loadSellerItems();
}

function addNewItem() {
    if (!currentUser || currentUser.login !== 'admin') {
        alert('Только администратор может добавлять товары');
        return;
    }
    
    const name = document.getElementById('itemName').value;
    const price = parseFloat(document.getElementById('sellerPrice').value);
    if (!name || !price) { alert('Заполните название и цену'); return; }
    
    const newItem = {
        id: equipmentData.length+1,
        name, 
        category: document.getElementById('itemCategory').value,
        description: document.getElementById('itemDescription').value,
        status: document.getElementById('itemStatus').value,
        image: "📦", 
        sellerPrice: price, 
        finalPrice: Math.round(price*1.35), 
        sellerName: "Василий"
    };
    equipmentData.push(newItem);
    
    sendEmailToAdmin('Новое объявление', 
        `${name}\nЦена продавца: ${price} ₽\nЦена продажи: ${newItem.finalPrice} ₽\nСтатус: ${newItem.status}`
    );
    showNotification('Товар добавлен');
    
    document.getElementById('itemName').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('sellerPrice').value = '';
    
    switchMarketplaceTab('catalog');
    loadMarketplaceData();
}

function loadSellerItems() {
    const container = document.getElementById('sellerItems');
    if (!currentUser || currentUser.login !== 'admin') {
        if (container) container.innerHTML = '<p>Доступ запрещён</p>';
        return;
    }
    
    const myItems = equipmentData.filter(i => i.sellerName === "Василий");
    if (!myItems.length) { 
        if (container) container.innerHTML = '<p>У вас пока нет товаров</p>'; 
        return; 
    }
    
    let html = '';
    myItems.forEach(item => {
        html += `<div class="seller-item">
            <div class="seller-item-image">${item.image}</div>
            <div style="flex:2">
                <h4>${escapeHtml(item.name)}</h4>
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
                        text: `<div class="user-message">📎 Прикреплён файл: ${file.name}</div>`,
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
                        text: `<div class="user-message">📎 Прикреплён файл: ${file.name}</div>`,
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

// ========== ЗАПРОС ПОДДЕРЖКИ (ОТПРАВКА НА ПОЧТУ) ==========
function requestSupport() {
    if (!currentUser) {
        alert('Для запроса поддержки необходимо авторизоваться');
        window.location.href = 'login.html';
        return;
    }
    
    // Создаём форму для ввода сообщения
    const message = prompt('📝 Опишите вашу проблему подробно:\n\nИнженер свяжется с вами в ближайшее время.\n\n(Email для ответа будет взят из вашего профиля)');
    
    if (!message) return;
    
    const userEmail = currentUser.email || prompt('📧 Введите ваш email для обратной связи:');
    if (!userEmail || !userEmail.includes('@')) {
        alert('Пожалуйста, введите корректный email');
        return;
    }
    
    const userName = currentUser.login || 'Пользователь';
    
    showNotification('📤 Отправка запроса...');
    
    fetch('send_support.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: userName,
            email: userEmail,
            message: message
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('✅ Запрос отправлен! Инженер свяжется с вами');
        } else {
            showNotification('❌ ' + (data.message || 'Ошибка отправки'));
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showNotification('❌ Ошибка соединения. Попробуйте позже');
    });
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
    checkAuth();
    
    const path = window.location.pathname;
    if (path.includes('test.html')) {
        testQueriesLeft = 1;
        const counter = document.getElementById('testQueryCounter');
        if (counter) counter.innerText = '1 запрос';
        createNewTestChat();
    }
    if (path.includes('profile.html')) loadUserChatHistory();
    if (path.includes('marketplace.html')) loadMarketplaceData();
});
