# 🧠 Квантовый конструктор — API сервера

> REST API для гибридного квантово-классического конструктора схем, обучения моделей, анализа запутанности и бенчмаркинга.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-green)](https://fastapi.tiangolo.com)

## 📦 Базовый URL

```
http://localhost:3001/api
```

- Все маршруты имеют префикс `/api`
- Формат данных: `application/json`
- Потоковые метрики обучения: **Server-Sent Events (SSE)**

---

## 📋 Содержание

- [Проекты](#-проекты-projects)
- [Схемы](#-схемы-circuits)
- [Обучение](#-обучение-training)
- [Анализ запутанности](#-анализ-запутанности-entanglement-analysis)
- [Бенчмарки](#-бенчмарки-и-сравнение-benchmark)
- [Вспомогательные](#-вспомогательные)
- [Примеры запросов](#-примеры-запросов)
- [Установка и запуск](#-установка-и-запуск)

---

## 📁 Проекты (Projects)

### `GET /api/projects`
Получить список всех проектов.

**Ответ**:
```json
{
  "projects": [
    {
      "id": "proj_01",
      "name": "Исследование запутанности",
      "description": "Тестирование GHZ-состояний",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### `POST /api/projects`
Создать новый проект.

**Тело**:
```json
{
  "name": "Новый проект",
  "description": "Описание (опционально)"
}
```

**Ответ**: созданный проект с `id`.

### `GET /api/projects/:id`
Получить детали проекта.

### `PUT /api/projects/:id`
Обновить название или описание.

### `DELETE /api/projects/:id`
Удалить проект (каскадно удаляет все связанные схемы и запуски обучения).

---

## 🔌 Схемы (Circuits)

### `GET /api/projects/:projectId/circuits`
Список всех схем в проекте.

### `POST /api/projects/:projectId/circuits`
Сохранить новую схему.

**Тело**:
```json
{
  "name": "GHZ-цепь",
  "qubitsCount": 3,
  "gates": [
    { "gate": "h", "qubits": [0] },
    { "gate": "cx", "qubits": [0, 1] },
    { "gate": "cx", "qubits": [1, 2] }
  ]
}
```

### `GET /api/circuits/:id`
Получить полные данные схемы.

### `PUT /api/circuits/:id`
Обновить схему (например, переименовать или заменить список гейтов).

### `DELETE /api/circuits/:id`
Удалить схему.

### `POST /api/circuits/:id/simulate`
Симулировать схему для визуализации.

**Тело** (опционально):
```json
{
  "shots": 1024
}
```

**Ответ**:
```json
{
  "probabilities": [0.5, 0.5, 0, ...],
  "stateVector": [[0.707, 0], [0, 0.707], ...],
  "blochVectors": [[0, 0, 1], ...],
  "measurements": { "counts": { "00": 512, "11": 512 } }
}
```

---

## 🧠 Обучение (Training)

### `POST /api/training`
Запустить асинхронное обучение гибридной модели.

**Тело**:
```json
{
  "projectId": "proj_01",
  "circuitId": "circ_01",               // опционально, можно передать gates напрямую
  "dataset": "MNIST",
  "epochs": 50,
  "learningRate": 0.01,
  "bondDim": 10,
  "qubitsCount": 4,
  "gates": [...]                        // если circuitId не указан
}
```

**Ответ**:
```json
{
  "id": "train_abc123"
}
```

### `GET /api/training/:id`
Получить статус и текущие метрики обучения.

**Ответ**:
```json
{
  "id": "train_abc123",
  "status": "running",
  "metrics": {
    "loss": [0.32, 0.28, ...],
    "accuracy": [0.85, 0.88, ...]
  },
  "finalAccuracy": null
}
```

### `GET /api/training/:id/events`
**SSE-поток** — выдаёт события по мере завершения эпох.

Пример сообщения:
```
event: epoch
data: {"epoch": 5, "loss": 0.21, "accuracy": 0.92}
```

### `DELETE /api/training/:id`
Остановить / отменить запущенное обучение.

---

## 🔬 Анализ запутанности (Entanglement Analysis)

### `POST /api/analyze/entanglement`
Вычислить метрики запутанности для схемы.

**Тело** (один из вариантов):
```json
{ "circuitId": "circ_01" }
```
или
```json
{
  "qubitsCount": 2,
  "gates": [
    { "gate": "h", "qubits": [0] },
    { "gate": "cx", "qubits": [0, 1] }
  ]
}
```

**Ответ**:
```json
{
  "concurrenceMatrix": [[0, 1], [1, 0]],
  "schmidtCoefficients": [0.707, 0.707],
  "entropy": 1.0
}
```

### `POST /api/analyze/state`
Анализ уже готового вектора состояния.

**Тело**:
```json
{
  "stateVector": [0.707, 0, 0, 0.707]
}
```

**Ответ**:
```json
{
  "blochVectors": [[0,0,1], [0,0,1]],
  "probabilities": [0.5, 0, 0, 0.5],
  "purity": 1.0
}
```

---

## ⚖️ Бенчмарки и сравнение (Benchmark)

### `GET /api/benchmark`
Получить предопределённые сравнительные данные (Qiskit, PennyLane и наша реализация).

**Ответ**:
```json
{
  "speed": {
    "ours": 120,
    "qiskit": 95,
    "pennylane": 110
  },
  "memory": {
    "ours": 256,
    "qiskit": 280,
    "pennylane": 270
  },
  "accuracy": {
    "ours": 0.94,
    "qiskit": 0.93,
    "pennylane": 0.94
  }
}
```

### `POST /api/benchmark/run`
Запустить новый бенчмарк на текущем фреймворке.

**Тело**:
```json
{
  "qubits": 4,
  "depth": 10,
  "shots": 2048
}
```

**Ответ**:
```json
{
  "timeMs": 342,
  "memoryMb": 128,
  "accuracy": 0.96
}
```

---

## 🛠️ Вспомогательные

### `GET /api/datasets`
Список доступных датасетов для обучения.

**Ответ**:
```json
{
  "datasets": ["MNIST", "FashionMNIST", "Iris", "Wine"]
}
```

### `GET /api/health`
Проверка работоспособности сервера.

**Ответ**:
```json
{ "status": "ok" }
```

---

## 📎 Примеры запросов

### Создание проекта и схемы

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","description":"Первый проект"}'

curl -X POST http://localhost:3001/api/projects/proj_01/circuits \
  -H "Content-Type: application/json" \
  -d '{"name":"Bell","qubitsCount":2,"gates":[{"gate":"h","qubits":[0]},{"gate":"cx","qubits":[0,1]}]}'
```

### Запуск обучения и подписка на SSE

```bash
# Запуск
curl -X POST http://localhost:3001/api/training \
  -H "Content-Type: application/json" \
  -d '{"projectId":"proj_01","circuitId":"circ_01","dataset":"Iris","epochs":10,"learningRate":0.01,"bondDim":5}'

# Подписка на события (используйте curl или любой SSE-клиент)
curl -N http://localhost:3001/api/training/train_abc123/events
```

### Анализ запутанности

```bash
curl -X POST http://localhost:3001/api/analyze/entanglement \
  -H "Content-Type: application/json" \
  -d '{"qubitsCount":2,"gates":[{"gate":"h","qubits":[0]},{"gate":"cx","qubits":[0,1]}]}'
```

---

## 🚀 Установка и запуск

1. **Клонировать репозиторий**
   ```bash
   git clone https://github.com/your-repo/quantum-constructor-backend.git
   cd quantum-constructor-backend
   ```

2. **Установить зависимости** (пример для Python + FastAPI)
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Запустить сервер**
   ```bash
   uvicorn main:app --reload --port 3001
   ```

4. **Проверить здоровье**
   ```bash
   curl http://localhost:3001/api/health
   ```

---

## 📐 Примечания по реализации

- Все маршруты возвращают ошибки в формате:
  ```json
  { "detail": "Сообщение об ошибке" }
  ```
- SSE-поток должен иметь заголовки `Content-Type: text/event-stream` и `Cache-Control: no-cache`.
- Идентификаторы проектов, схем и запусков генерируются сервером (UUID или nanoID).
- Обучение выполняется в фоновом режиме (Celery, BackgroundTasks или отдельный поток).
- Для симуляции квантовых схем можно использовать `qiskit`, `pennylane` или `cirq`.
