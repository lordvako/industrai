<?php
// send_support.php - отправка письма инженеру
header('Content-Type: application/json; charset=utf-8');

// ========== НАСТРОЙКИ ==========
$to = 'iris.salnikov@yandex.ru';
$subject = '=?UTF-8?B?' . base64_encode('📞 Запрос поддержки от пользователя') . '?=';

// Получаем данные
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'Некорректные данные']);
    exit;
}

$userName = isset($data['name']) ? trim($data['name']) : 'Неизвестный пользователь';
$userEmail = isset($data['email']) ? trim($data['email']) : 'email не указан';
$message = isset($data['message']) ? trim($data['message']) : 'Без сообщения';

if (empty($message)) {
    echo json_encode(['success' => false, 'message' => 'Введите сообщение']);
    exit;
}

// Формируем письмо
$body = "========================================\n";
$body .= "📞 НОВЫЙ ЗАПРОС ПОДДЕРЖКИ\n";
$body .= "========================================\n\n";
$body .= "👤 Пользователь: $userName\n";
$body .= "📧 Email: $userEmail\n";
$body .= "🕐 Время: " . date('d.m.Y H:i:s') . "\n\n";
$body .= "💬 СООБЩЕНИЕ:\n";
$body .= "----------------------------------------\n";
$body .= wordwrap($message, 70) . "\n";
$body .= "----------------------------------------\n\n";
$body .= "Ответьте на это письмо, чтобы связаться с пользователем.\n";

// Заголовки для корректной кодировки
$headers = "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";
$headers .= "From: IndustrAI Support <support@industrai.ru>\r\n";
$headers .= "Reply-To: $userEmail\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

// Отправляем
if (mail($to, $subject, $body, $headers)) {
    echo json_encode(['success' => true, 'message' => 'Запрос отправлен успешно']);
} else {
    echo json_encode(['success' => false, 'message' => 'Ошибка отправки. Попробуйте позже']);
}
?>