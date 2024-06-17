from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from dotenv import load_dotenv
from fastapi import FastAPI
import uvicorn
import os

# Load .env file
load_dotenv()

from runnable import get_runnable

# Sets up LangSmith tracing
os.environ['LANGCHAIN_TRACING_V2'] = 'true'
os.environ['LANGCHAIN_ENDPOINT'] = 'https://api.smith.langchain.com'
os.environ["LANGCHAIN_PROJECT"] = "Fitness Program Creator"

app = FastAPI(
    title="Trainer's Ally Backend",
    version="1.0",
    description="LangGraph backend for the Trainer's Ally application.",
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

def main():
    # Fetch the Trainer's Ally runnable which generates the workouts
    runnable = get_runnable()

    # Create the Fast API route to invoke the runnable
    add_routes(
        app,
        runnable,
        path="/workout",
    )

    # Start the API
    uvicorn.run(app, host="localhost", port=8000)

if __name__ == "__main__":
    main()