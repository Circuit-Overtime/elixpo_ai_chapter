FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
COPY . .

EXPOSE 5000
ENV FLASK_APP=ai_search_agent_prod.py
# CMD ["waitress-serve", "--host=10.42.0.56", "--port=5000", "ai_search_agent_prod:app", ">", "access.log", "2>", "error.log"]
CMD ["waitress-serve", "--host=10.42.0.56", "--port=5000", "ai_search_agent_prod:app"]
