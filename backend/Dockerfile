FROM python:3.12-slim

# Install SWI-Prolog from Debian official repos (available in Trixie/Bookworm)
RUN apt-get update && apt-get install -y --no-install-recommends \
    swi-prolog \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1001 prologuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY app/ ./app/

# Switch to non-root user
USER prologuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
