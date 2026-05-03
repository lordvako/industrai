<?php
// groq_proxy.php - Прокси для запросов к Groq API
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Обрабатываем preflight запрос (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Проверяем, что это POST запрос
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Метод не поддерживается. Используйте POST.']);
    exit;
}

// ========== НАСТРОЙКИ ==========
// ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ API КЛЮЧ GROQ!
// Получить ключ: https://console.groq.com/keys
$GROQ_API_KEY = 'gsk_ВАШ_КЛЮЧ_GROQ';

$GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Получаем данные от клиента
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    echo json_encode(['error' => 'Некорректные данные запроса']);
    exit;
}

// Логируем запрос для отладки (можно удалить после настройки)
error_log("GROQ Request: " . $input);

// Отправляем запрос к Groq
$ch = curl_init($GROQ_API_URL);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $GROQ_API_KEY
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'IndustrAI-Proxy/1.0');

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Логируем ответ для отладки
error_log("GROQ Response Code: " . $httpCode);
error_log("GROQ Response: " . substr($response, 0, 500));

if ($curlError) {
    echo json_encode(['error' => 'CURL ошибка: ' . $curlError]);
    exit;
}

if ($httpCode !== 200) {
    echo json_encode(['error' => 'Ошибка Groq API: HTTP ' . $httpCode, 'details' => $response]);
    exit;
}

http_response_code(200);
echo $response;
?>
