<?php
// search_forum.php - поиск по таблице forum_knowledge
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// ========== НАСТРОЙКИ ПОДКЛЮЧЕНИЯ К БАЗЕ ДАННЫХ JINO.RU ==========
// ВАЖНО: ЗАМЕНИТЕ НА ВАШИ РЕАЛЬНЫЕ ДАННЫЕ!
$host = 'localhost';
$dbname = 'j53756923_industrai_db';  // имя вашей базы данных
$username = 'j53756923';              // ваш логин от базы данных
$password = '!15012034Cc!'; // ВАЖНО: ЗАМЕНИТЕ НА РЕАЛЬНЫЙ ПАРОЛЬ!

// Получаем запрос пользователя
$query = isset($_GET['q']) ? trim($_GET['q']) : '';
if (strlen($query) < 3) {
    echo json_encode([]);
    exit;
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Поиск по ключевым словам
    $searchTerm = '%' . $query . '%';
    $sql = "SELECT problem, solution, manufacturer, device_model, error_code, has_solution 
            FROM forum_knowledge 
            WHERE problem LIKE :term1 
               OR solution LIKE :term2 
               OR manufacturer LIKE :term3 
               OR error_code LIKE :term4
            ORDER BY 
                CASE 
                    WHEN problem LIKE :term1 THEN 1
                    WHEN error_code LIKE :term4 THEN 2
                    WHEN manufacturer LIKE :term3 THEN 3
                    ELSE 4
                END
            LIMIT 10";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':term1' => $searchTerm,
        ':term2' => $searchTerm,
        ':term3' => $searchTerm,
        ':term4' => $searchTerm
    ]);
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Обрезаем длинные тексты для читаемости
    foreach ($results as &$row) {
        if (strlen($row['solution']) > 600) {
            $row['solution'] = substr($row['solution'], 0, 600) . '...';
        }
        if (strlen($row['problem']) > 200) {
            $row['problem'] = substr($row['problem'], 0, 200) . '...';
        }
    }
    
    echo json_encode($results);
    
} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
