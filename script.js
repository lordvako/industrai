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

// ========== КОНФИГУРАЦИЯ OPENAI API С ПРОКСИ ==========
const OPENAI_CONFIG = {
    apiKey: 'sk-1234abcd1234abcd1234abcd1234abcd1234abcd', // Ваш OpenAI ключ
    // Используем публичный прокси для обхода CORS
    apiUrl: 'https://cors-anywhere.herokuapp.com/https://api.openai.com/v1/chat/completions',
    // Альтернативный прокси (если первый не работает):
    // apiUrl: 'https://api.codetabs.com/v1/proxy/?quest=https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
};

// ========== ФУНКЦИЯ ВЫЗОВА OPENAI API ==========
async function callOpenAIAPI(messages) {
    try {
        console.log('🤖 Отправка запроса к OpenAI через прокси...');
        
        const response = await fetch(OPENAI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
                'X-Requested-With': 'XMLHttpRequest' // Нужно для cors-anywhere
            },
            body: JSON.stringify({
                model: OPENAI_CONFIG.model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000,
                top_p: 0.9
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Ошибка OpenAI API:', response.status, errorData);
            
            if (response.status === 401) {
                return "❌ Ошибка авторизации API. Проверьте ваш OpenAI ключ.";
            } else if (response.status === 429) {
                return "❌ Превышен лимит запросов или недостаточно средств на счету.";
            } else {
                return `❌ Ошибка API (${response.status}). Пожалуйста, попробуйте позже.`;
            }
        }

        const data = await response.json();
        console.log('✅ Ответ получен от OpenAI');
        return data.choices[0].message.content;

    } catch (error) {
        console.error('❌ Ошибка сети:', error);
        
        // Пробуем альтернативный прокси
        try {
            console.log('🔄 Пробуем альтернативный прокси...');
            const altResponse = await fetch('https://api.codetabs.com/v1/proxy/?quest=https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`
                },
                body: JSON.stringify({
                    model: OPENAI_CONFIG.model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });
            
            if (altResponse.ok) {
                const altData = await altResponse.json();
                return altData.choices[0].message.content;
            }
        } catch (altError) {
            console.error('❌ Альтернативный прокси тоже не работает:', altError);
        }
        
        return "❌ Ошибка соединения. Пожалуйста, убедитесь, что:\n1. У вас есть доступ к интернету\n2. Ваш OpenAI ключ корректен\n3. На счету есть средства";
    }
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
                text: '🔍 Задайте вопрос по оборудованию. Я помогу найти решение!',
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
            text: '🔍 Задайте вопрос по оборудованию. Я помогу найти решение!',
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
    
    // Индикатор загрузки
    chat.messages.push({ 
        sender: 'bot', 
        text: '🤔 Думаю...', 
        timestamp: new Date().toISOString() 
    });
    loadProfileChat(currentChatId);
    
    // Формируем историю для контекста
    const messageHistory = [];
    for (let i = Math.max(0, chat.messages.length - 10); i < chat.messages.length - 1; i++) {
        const m = chat.messages[i];
        if (m.sender === 'user') {
            messageHistory.push({ role: 'user', content: m.text });
        } else if (m.sender === 'bot' && m.text !== '🤔 Думаю...') {
            messageHistory.push({ role: 'assistant', content: m.text });
        }
    }
    
    // Добавляем текущий вопрос
    messageHistory.push({ role: 'user', content: msg });
    
    // Отправляем к OpenAI
    const reply = await callOpenAIAPI(messageHistory);
    
    // Удаляем индикатор и добавляем ответ
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
    
    chat.messages.push({ sender: 'bot', text: '🤔 Думаю...', timestamp: new Date().toISOString() });
    loadTestChat(testCurrentChatId);
    
    // Формируем историю
    const messageHistory = [{ role: 'user', content: msg }];
    const reply = await callOpenAIAPI(messageHistory);
    
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
    checkAuth();
    
    const path = window.location.pathname;
    if (path.includes('test.html')) {
        testQueriesLeft = 1;
        document.getElementById('testQueryCounter') && (document.getElementById('testQueryCounter').innerText = '1 запрос');
        createNewTestChat();
    }
    if (path.includes('profile.html')) loadUserChatHistory();
    if (path.includes('marketplace.html')) loadMarketplaceData();
});
