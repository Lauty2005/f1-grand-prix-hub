# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1000 agent && chown -R agent:agent /app
USER agent

# Entrypoint actual del agente. El registro de publicados queda en /app porque
# el contexto de build es f1_agent/ (en CI la ruta es f1_agent/publicados.json).
# El sync de Jolpica se agrega en el paso 5.
CMD ["python", "main.py", "--published-registry", "publicados.json"]
