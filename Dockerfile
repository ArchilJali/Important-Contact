FROM python:3.12-slim
WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 appuser
# Tests, SQL, seed and historical data are deliberately NOT copied into the runtime image.
COPY app/*.py ./app/
COPY app/static/ ./app/static/
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
