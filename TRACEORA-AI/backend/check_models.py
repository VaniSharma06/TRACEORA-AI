
import os
import requests
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GROQ_API_KEY")

response = requests.get(
    "https://api.groq.com/openai/v1/models",
    headers={"Authorization": f"Bearer {key}"}
)

print("Status:", response.status_code)

if response.ok:
    for model in response.json()["data"]:
        print(model["id"])
else:
    print(response.text)
