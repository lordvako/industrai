<?php
// groq_proxy.php - Прокси для запросов к Groq API
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Обрабатываем preflight запрос
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ========== НАСТРОЙКИ ==========
// ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ API КЛЮЧ GROQ!
$GROQ_API_KEY = 'gsk_ВАШ_КЛЮЧ_GROQ';

$GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Получаем данные от клиента
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    echo json_encode(['error' => 'Некорректные данные']);
    exit;
}

// Добавляем таймаут для долгих ответов
set_time_limit(60);

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
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Иногда нужно для Jino.ru
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    echo json_encode(['error' => 'CURL ошибка: ' . $curlError]);
    exit;
}

http_response_code($httpCode);
echo $response;
?>