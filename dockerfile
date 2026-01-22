# Используем официальный образ Python как базовый
FROM python:3.9-slim-buster

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем файл requirements.txt в контейнер
COPY requirements.txt /app/requirements.txt

# Устанавливаем зависимости из requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Копируем все остальные файлы из текущей директории в контейнер
COPY . /app

# Указываем команду для запуска приложения
CMD ["python", "app.py"]

# Открываем порт 5002 для доступа к приложению
EXPOSE 5002
