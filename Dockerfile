FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

RUN pip install --no-cache-dir --timeout 120 -i ${PIP_INDEX_URL} -r /app/requirements.txt

COPY . /app

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
