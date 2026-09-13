FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0

COPY . .

RUN useradd -r -u 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
# 注意：生产环境通过环境变量注入 SECRET_KEY / DATABASE_URL / MAIL_* 等
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "--timeout", "30", "wsgi:app"]
