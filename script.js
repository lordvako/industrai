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

// Функция для создания нового пользователя при покупке
function createUser(email, plan) {
    const login = email.substring(0, 6) + Math.floor(Math.random() * 1000);
    const password = Math.random().toString(36).substring(2, 10) + Math.floor(Math.random() * 100);
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    
    users[login] = {
        password: btoa(password),
        email: email,
        plan: plan,
        created: new Date().toISOString(),
        expiry: expiryDate.toISOString()
    };
    
    localStorage.setItem('industrai_users', JSON.stringify(users));
    
    if (!chatHistory[login]) {
        chatHistory[login] = [];
    }
    localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
    
    return { login, password };
}

// Проверка авторизации
function checkAuth() {
    const userMenu = document.getElementById('userMenu');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const loginBtn = document.getElementById('loginBtn');
    const testDriveLink = document.getElementById('testDriveLink');
    const subscriptionBanner = document.getElementById('subscriptionBanner');
    const mainActionBtn = document.getElementById('mainActionBtn');
    const mainActionHint = document.getElementById('mainActionHint');
    const cabinetTabButton = document.getElementById('cabinetTabButton');
    
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
            if (subText) subText.textContent = 'Спасибо за приобретение подписки! Теперь у вас есть неограниченный доступ к технической нейросети.';
            
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
        
        if (currentUser.login === 'admin' && cabinetTabButton) {
            cabinetTabButton.style.display = 'inline-block';
        }
        
        // Если мы на странице профиля, загружаем историю
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

// ========== ИСТОРИЯ ЧАТОВ ==========

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
                    text: 'Введите запрос по оборудованию. Например: SEW F04, Siemens ALARM 3000',
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
                text: 'Введите запрос по оборудованию. Например: SEW F04, Siemens ALARM 3000',
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
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">
                    ${msg.text}
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

function sendProfileMessage() {
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
    
    setTimeout(() => {
        let reply = '';
        const q = msg.toLowerCase();

        // ========== SIEMENS S7 ==========
        if ((q.includes('s7') || q.includes('simatic') || q.includes('siemens')) && 
            (q.includes('314') || q.includes('315') || q.includes('300'))) {
            
            if (q.includes('sf')) {
                reply = `S7-300 SF - системная ошибка / аппаратная неисправность
Проверка:
1. Индикаторы на модулях (SF горит, возможно BF, DC)
2. Ошибки в диагностическом буфере (HW Config / Step7)
3. Питание 24В на всех модулях
4. Конфигурация оборудования (несоответствие проекта)
Типовые причины: отказ модуля, потеря конфигурации, ошибка на шине
Вероятность: 85%`;
            } 
            else if (q.includes('bf')) {
                reply = `S7-300 BF - ошибка шины PROFIBUS
Проверка:
1. Терминаторы на концах шины
2. Кабель (обрывы, экран, длина линии)
3. Скорость передачи (одинакова у всех)
4. Адреса станций (конфликты)
5. Повторители при большой длине
Вероятность: 92%`;
            }
            else if (q.includes('dc')) {
                reply = `S7-300 DC - ошибка питания / низкое напряжение
Проверка:
1. Напряжение на блоке питания (24В ±10%)
2. Потребляемый ток (не превышает макс.)
3. Контакты и соединения
4. Импульсные помехи в сети
Вероятность: 88%`;
            }
            else if (q.includes('5v') || q.includes('5в')) {
                reply = `S7-300 5V - ошибка внутреннего питания
Проверка:
1. Блок питания (замена, если неисправен)
2. Перегрузка по току 5В (много модулей)
3. Короткое замыкание в модулях
Вероятность: 78%`;
            }
            else {
                reply = `S7-300 - диагностика по индикаторам:
SF (красный) - системная ошибка
BF (красный) - ошибка шины
DC (желтый) - питание в норме
5V (зеленый) - внутреннее питание

Уточните код ошибки из диагностического буфера Step7.`;
            }
        }
        // ========== S7-1200 / 1500 ==========
        else if ((q.includes('s7') || q.includes('simatic')) && (q.includes('1200') || q.includes('1500'))) {
            reply = `S7-${q.includes('1200') ? '1200' : '1500'} - диагностика через TIA Portal:
1. Подключиться к контроллеру
2. Открыть онлайн-представление
3. Проверить диагностический буфер
4. Проверить индикаторы ERROR, MAINT

Возможные причины:
- Ошибка программы (деление на ноль, таймаут)
- Неисправность модуля ввода-вывода
- Ошибка связи с периферией

Вероятность: 87%`;
        }
        // ========== SEW ==========
        else if (q.includes('sew') || q.includes('movitrac') || q.includes('movimot')) {
            if (q.includes('f01')) {
                reply = `SEW F01 - перегрузка по току / короткое замыкание
Проверка:
1. Обмотки двигателя (межвитковое замыкание)
2. Кабель мотора (обрыв, замыкание)
3. Изоляция (пробой на корпус)
4. Параметры двигателя в приводе (Р700-Р705)
Вероятность: 82%`;
            }
            else if (q.includes('f02')) {
                reply = `SEW F02 - превышение напряжения в промежуточном контуре
Проверка:
1. Напряжение сети (слишком высокое)
2. Тормозной резистор (обрыв, сопротивление)
3. Время разгона/торможения (слишком малое)
4. Рекуперация энергии (частые пуски/торможения)
Вероятность: 78%`;
            }
            else if (q.includes('f03')) {
                reply = `SEW F03 - перегрев инвертора
Проверка:
1. Вентилятор охлаждения (работает)
2. Засорение радиатора (пыль, грязь)
3. Температура окружающей среды (выше 40°C)
4. Нагрузка (превышение номинала)
Вероятность: 88%`;
            }
            else if (q.includes('f04')) {
                reply = `SEW F04 - перегрузка по току / тормозной резистор
Проверка:
1. Сопротивление резистора (15-100 Ом)
2. Обрывы цепи торможения
3. Частота торможений (слишком частая)
4. Параметры Р700-Р705 (ток двигателя)
Вероятность: 94%`;
            }
            else if (q.includes('f05')) {
                reply = `SEW F05 - перегрузка инвертора / перегрев
Проверка:
1. Ток двигателя (не превышает номинал)
2. Вентилятор охлаждения (работает)
3. Загрузка механизма (заклинивание)
4. Механика редуктора, подшипники
При токе в норме: проверять механику.
Вероятность: 76%`;
            }
            else if (q.includes('f07')) {
                reply = `SEW F07 - обрыв фазы на выходе
Проверка:
1. Кабель двигателя (целостность)
2. Контакты в клеммнике
3. Обмотки двигателя (обрыв)
4. Выходные транзисторы инвертора
Вероятность: 89%`;
            }
            else if (q.includes('f08')) {
                reply = `SEW F08 - превышение частоты вращения
Проверка:
1. Задание частоты (слишком высокое)
2. Энкодер (неисправность, обрыв)
3. Параметры ограничения частоты
4. Механика (потеря нагрузки, разнос)
Вероятность: 83%`;
            }
            else {
                reply = `SEW - диагностика по коду ошибки:
F01 - перегрузка/КЗ
F02 - превышение напряжения
F03 - перегрев
F04 - перегрузка/тормозной резистор
F05 - перегрузка инвертора
F07 - обрыв фазы
F08 - превышение частоты

Уточните код ошибки.`;
            }
        }
        // ========== SINUMERIK ==========
        else if (q.includes('sinumerik') || q.includes('840d') || q.includes('810d')) {
            if (q.includes('3000')) {
                reply = `Sinumerik 3000 - концевой выключатель оси X
Проверка:
1. Концевик оси X (сработал, неисправен)
2. Кабель энкодера (обрыв, экран)
3. Настройки софт-эндшвиттов (параметры)
4. Референтные точки (потеря референцирования)
Вероятность: 96%`;
            }
            else if (q.includes('25000')) {
                reply = `Sinumerik 25000 - ошибка энкодера / датчика
Проверка:
1. Энкодер (замена, проверка)
2. Кабель энкодера (обрыв, помехи)
3. Интерфейсный модуль (SMC, SME)
4. Настройки параметров (тип энкодера)
Вероятность: 91%`;
            }
            else {
                reply = `Sinumerik - общая диагностика:
1. Проверить журнал ошибок NCK
2. Проверить питание 24В
3. Проверить энкодеры и концевики
4. Перезагрузить управление (NCK reset)
5. Проверить связь с приводом (Profibus/Profinet)

Уточните номер ALARM.`;
            }
        }
        // ========== DELTA ==========
        else if (q.includes('delta') && (q.includes('as') || q.includes('dop'))) {
            if (q.includes('as300')) {
                reply = `Delta AS300 - диагностика:
1. Индикаторы RUN/ERROR
2. Питание 24В (наличие)
3. Связь с панелью (кабель, настройки)
4. Программа (ошибка, зависание)
Типовые проблемы: потеря связи, перегрузка выхода.
Вероятность: 84%`;
            }
            else if (q.includes('dop')) {
                reply = `Delta DOP-100 - диагностика панели:
1. Питание 24В
2. Подсветка (проверить яркость)
3. Связь с контроллером (кабель, протокол)
4. Проект (ошибка компиляции)
5. Сенсорный экран (калибровка)
Вероятность: 81%`;
            }
        }
        // ========== WIELAND ==========
        else if (q.includes('wieland') || q.includes('sp-cop2') || q.includes('sp-sdio')) {
            if (q.includes('sp-cop2')) {
                reply = `Wieland SP-COP2 - диагностика контроллера:
1. Питание 24В
2. Индикаторы PWR, RUN, ERR
3. Связь по Ethernet (IP-адрес, пинг)
4. Конфигурация (соответствие проекту)
Вероятность: 86%`;
            }
            else if (q.includes('sp-sdio')) {
                reply = `Wieland SP-SDIO84 - модуль ввода-вывода:
1. Питание 24В
2. Индикаторы каналов
3. Подключение датчиков (NP/NPN)
4. Связь с контроллером по шине
Вероятность: 83%`;
            }
        }
        // ========== OMRON ==========
        else if (q.includes('omron') || q.includes('3g3') || q.includes('v7') || q.includes('e7')) {
            if (q.includes('oc') || q.includes('overcurrent')) {
                reply = `Omron OC - перегрузка по току (>240% номинала)
Проверка:
1. Обмотки двигателя (межвитковое замыкание)
2. Кабель мотора (обрыв, замыкание)
3. Время разгона/торможения (слишком малое)
4. Нагрузка на валу (заклинивание)
Вероятность: 85%`;
            }
            else if (q.includes('ov') || q.includes('overvoltage')) {
                reply = `Omron OV - перенапряжение в звене DC
Проверка:
1. Напряжение сети (выше нормы)
2. Тормозной резистор (обрыв)
3. Время торможения (слишком короткое)
4. Рекуперация (частые пуски/торможения)
200V: >410V DC, 400V: >820V DC
Вероятность: 78%`;
            }
            else if (q.includes('oh') || q.includes('overheat')) {
                reply = `Omron OH - перегрев радиатора (>90°C)
Проверка:
1. Вентилятор охлаждения (работает)
2. Засорение радиатора (пыль, грязь)
3. Температура в шкафу (выше 40°C)
4. Нагрузка (превышение номинала)
Вероятность: 88%`;
            }
            else if (q.includes('cpf00')) {
                reply = `Omron CPF00 - нет связи с пультом при включении
Проверка:
1. Пульт закреплён (посадочное место)
2. Выключить/включить питание
3. Заменить пульт или инвертор (если не помогает)
Вероятность: 76%`;
            }
            else if (q.includes('cpf01')) {
                reply = `Omron CPF01 - потеря связи с пультом
Проверка:
1. Пульт закреплён
2. Выключить/включить питание
3. Заменить пульт или инвертор
Вероятность: 72%`;
            }
            else if (q.includes('ef') || q.includes('external fault')) {
                reply = `Omron EF - внешняя ошибка
Проверка:
1. Внешние клеммы (NO/NC контакт)
2. Сигнал от PLC (не приходит)
3. Проводка (обрыв, КЗ)
Вероятность: 84%`;
            }
            else if (q.includes('gf') || q.includes('ground fault')) {
                reply = `Omron GF - замыкание на землю
Проверка:
1. Изоляция двигателя (пробой на корпус)
2. Кабель мотора (повреждение изоляции)
3. Выходные транзисторы (пробой)
Вероятность: 81%`;
            }
            else {
                reply = `Omron - частые ошибки:
OC (перегрузка по току)
OV (перенапряжение)
OH (перегрев)
GF (замыкание на землю)
EF (внешняя ошибка)
CPF00/CPF01 (связь с пультом)
Уточните код ошибки.`;
            }
        }
        // ========== MITSUBISHI ==========
        else if (q.includes('mitsubishi') || q.includes('melservo') || q.includes('mr-j') || q.includes('fr-d') || q.includes('fr-e')) {
            if (q.includes('al 16') || q.includes('al16')) {
                reply = `Mitsubishi AL 16 - ошибка энкодера
Проверка:
1. Кабель энкодера (обрыв, экран)
2. Энкодер (замена, проверка)
3. Разъёмы (контакт)
4. Помехи (экранирование)
Вероятность: 87%`;
            }
            else if (q.includes('al 24') || q.includes('al24')) {
                reply = `Mitsubishi AL 24 - ошибка связи
Проверка:
1. Кабель связи (обрыв)
2. Терминаторы (на концах)
3. Скорость передачи (совпадение)
4. Адреса станций (конфликты)
Вероятность: 83%`;
            }
            else if (q.includes('al 37') || q.includes('al37')) {
                reply = `Mitsubishi AL 37 - перегрузка сервопривода
Проверка:
1. Нагрузка на валу (заклинивание)
2. Механика (редуктор, подшипники)
3. Параметры момента
4. Тормоз (расторможен)
Вероятность: 88%`;
            }
            else if (q.includes('al 45') || q.includes('al45')) {
                reply = `Mitsubishi AL 45 - ошибка питания
Проверка:
1. Напряжение питания (24В)
2. Блок питания (неисправен)
3. Перегрузка по току
4. Короткое замыкание
Вероятность: 79%`;
            }
            else {
                reply = `Mitsubishi - диагностика:
AL 16 (энкодер)
AL 24 (связь)
AL 37 (перегрузка)
AL 45 (питание)
Уточните код ошибки.`;
            }
        }
        // ========== КИТАЙСКИЕ ЧАСТОТНИКИ ==========
        else if (q.includes('китай') || q.includes('chinese') || q.includes('9000') || q.includes('vesper') || q.includes('hyundai') || q.includes('веспер')) {
            if (q.includes('oc') || q.includes('перегрузка') || q.includes('overcurrent')) {
                reply = `Китайский частотник OC - перегрузка по току
Проверка:
1. Некачественные силовые транзисторы (частая причина выхода)
2. Драйверы (проверить осциллографом)
3. Резисторы в цепи тока (3мОм, целостность)
4. Защита по току (параметр F035, часто 200%)
Внимание: китайские частотники часто выходят из строя при реальной перегрузке из-за слабой элементной базы.
Вероятность: 74%`;
            }
            else if (q.includes('oh') || q.includes('перегрев')) {
                reply = `Китайский частотник OH - перегрев
Проверка:
1. Вентилятор охлаждения (слабый, шумный)
2. Радиатор (забит пылью)
3. Температура окружающей среды
4. Нагрузка (реальная vs номинал)
Вероятность: 71%`;
            }
            else if (q.includes('f000') || q.includes('f001')) {
                reply = `Китайский частотник Fxxx - общая ошибка
Смотрите инструкцию (в палец толщиной).
Параметры:
F000-F099 - настройки
F035 - точка перегрузки по току (10-200%)
F051 - время теплового реле
Часто проблема: защита не срабатывает, горят транзисторы.
Вероятность: 65%`;
            }
            else {
                reply = `Китайские частотники (общее):
OC (перегрузка, часто горит)
OH (перегрев)
Fxxx (смотреть инструкцию)
Качество защиты часто ниже заявленного. Рекомендуется запас по току 30-50%.`;
            }
        }
        // ========== ОБЩИЙ СЛУЧАЙ ==========
        else {
            reply = `Для точной диагностики укажите:
Производитель (Siemens, SEW, Omron, Mitsubishi, Delta, Wieland, китайский)
Модель (S7-300, Movitrac, 3G3JZ, MR-J5)
Код ошибки (F04, 3000, SF, OC, AL 16)

Примеры:
• "Omron 3G3JZ ошибка OC"
• "Mitsubishi серво AL 37"
• "Китайский частотник 9000 перегрузка"`;
        }
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        localStorage.setItem('industrai_chat_history', JSON.stringify(chatHistory));
        loadProfileChat(currentChatId);
    }, 1000);
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
                text: 'Введите запрос. Например: SEW F04, Sinumerik 3000',
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
        html += `
            <div class="message ${msg.sender}">
                <div class="message-avatar">${msg.sender === 'user' ? 'Я' : 'AI'}</div>
                <div class="message-content">${msg.text}</div>
            </div>
        `;
    });
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendTestMessage() {
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
    
    setTimeout(() => {
        let reply = '';
        const q = msg.toLowerCase();
        
        if (q.includes('sew') && q.includes('f01')) {
            reply = 'SEW F01 - проверьте обмотки двигателя и кабель';
        } else if (q.includes('sew') && q.includes('f04')) {
            reply = 'SEW F04 - проверьте тормозной резистор';
        } else if (q.includes('sinumerik')) {
            reply = 'Sinumerik 3000 - проверьте концевик оси X';
        } else {
            reply = 'Уточните модель оборудования и код ошибки';
        }
        
        chat.messages.push({
            sender: 'bot',
            text: reply,
            timestamp: new Date().toISOString()
        });
        
        loadTestChat(testCurrentChatId);
    }, 1000);
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
    if (container) container.innerHTML = html;
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

function sendEmailToAdmin(subject, body) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `mailto:iris.salnikov@yandex.ru?subject=${encodeURIComponent('[IndustrAI] ' + subject)}&body=${encodeURIComponent(body)}`;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 1000);
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
    checkAuth();
    
    // Если мы на странице биржи, загружаем данные
    if (window.location.pathname.includes('marketplace.html')) {
        loadMarketplaceData();
    }
    
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
                    text: 'Введите запрос. Например: SEW F04, Sinumerik 3000',
                    timestamp: new Date().toISOString()
                }
            ],
            createdAt: new Date().toISOString()
        }];
        testCurrentChatId = testChatHistory[0].id;
        renderTestHistory();
        loadTestChat(testCurrentChatId);
    }
});
