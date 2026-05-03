<?php
// search_forum.php - поиск по таблице forum_knowledge
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// ========== НАСТРОЙКИ ПОДКЛЮЧЕНИЯ К БАЗЕ ДАННЫХ ==========
$host = 'localhost';
$dbname = 'j53756923_industrai_db';
$username = 'j53756923';
$password = '!15012034Cc!';

// Получаем запрос пользователя
$query = isset($_GET['q']) ? trim($_GET['q']) : '';
if (strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Разбиваем запрос на отдельные ключевые слова
    $words = preg_split('/\s+/', $query);
    $wordConditions = [];
    $params = [];
    $i = 1;
    
    foreach ($words as $word) {
        $word = trim($word);
        if (strlen($word) >= 3) {
            $wordConditions[] = "(problem LIKE :word$i OR solution LIKE :word$i)";
            $params[":word$i"] = '%' . $word . '%';
            $i++;
        }
    }
    
    // Основной поиск по всей фразе
    $searchTerm = '%' . $query . '%';
    $params[':term1'] = $searchTerm;
    $params[':term2'] = $searchTerm;
    $params[':term3'] = $searchTerm;
    $params[':term4'] = $searchTerm;
    
    // Строим SQL
    $sql = "SELECT problem, solution, manufacturer, device_model, error_code, has_solution 
            FROM forum_knowledge 
            WHERE problem LIKE :term1 
               OR solution LIKE :term2 
               OR manufacturer LIKE :term3 
               OR error_code LIKE :term4";
    
    // Добавляем поиск по отдельным словам
    if (!empty($wordConditions)) {
        $sql .= " OR (" . implode(" OR ", $wordConditions) . ")";
    }
    
    $sql .= " ORDER BY 
                CASE 
                    WHEN problem LIKE :term1 THEN 1
                    WHEN error_code LIKE :term4 THEN 2
                    WHEN manufacturer LIKE :term3 THEN 3
                    ELSE 4
                END
            LIMIT 15";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Форматируем вывод
    foreach ($results as &$row) {
        if (isset($row['solution']) && strlen($row['solution']) > 600) {
            $row['solution'] = mb_substr($row['solution'], 0, 600, 'UTF-8') . '...';
        }
        if (isset($row['problem']) && strlen($row['problem']) > 200) {
            $row['problem'] = mb_substr($row['problem'], 0, 200, 'UTF-8') . '...';
        }
        // Убираем лишние символы
        $row['solution'] = str_replace('[:\s]', ' ', $row['solution']);
        $row['problem'] = str_replace('[:\s]', ' ', $row['problem']);
    }
    
    echo json_encode($results, JSON_UNESCAPED_UNICODE);
    
} catch (PDOException $e) {
    echo json_encode(['error' => 'Ошибка базы данных: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
?>
