<a href="https://trainers-ally.vercel.app/share/nq4KdXU">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="https://i.imgur.com/kTxf5Ye.png">
  <h1 align="center">Trainer's Ally</h1>
</a>

<p align="center">
  An open source application powered by Nvidia, LangChain, and the Vercel AI SDK for personal trainers
  to create highly customized workouts for their clients in just minutes by working alongside Artificial Intelligence.
</p>

<p align="center">
  LLMs powered by Nvidia used by LangGraph agents generate workouts day by day, stopping each day to accept feedback and exercise
  alternatives from the personal trainer. This is the first application of its kind - never has there been a way for personal trainers
  to work closely with AI to create workouts and not just have AI do all the work with no guidance.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#deployment-note"><strong>Deployment Note</strong></a> ·
  <a href="#how-to-use"><strong>How to Use</strong></a> ·
  <a href="#technical-details"><strong>Technical Details</strong></a> ·
  <a href="#running-backend-locally"><strong>Running Backend Locally</strong></a> ·
  <a href="#running-frontend-locally"><strong>Running Frontend Locally</strong></a> ·
  <a href="#future-work"><strong>Future Work</strong></a> ·
  <a href="#authors"><strong>Authors</strong></a>
</p>
<br/>

## Features

- A powerful set of AI agents that are used to generate weekly sets of workouts for clients, one day at a time
- Provide input for the AI to generate workouts such as the client goals, access to gym equipment, workout preferences, etc.
- After generating each workout, users can optionally select AI provided exercise alternatives or provide free form feedback
- After AI revises a workout, users are given control again to select any final alternative exercises before moving on to the next day
- After all workouts for the week are created, the AI outputs the final list and users can again select any alternatives

<br/>

## Deployment Note

NOTE that this application hosted with Vercel is not enabled to use the LangServe backend currently, since that would take my Nvidia NIMS API credits. 

The Vercel hosted frontend can be used to view shared workouts (like by clicking the Trainer's Ally link at the top of the README), but cannot currently be used to generate your own workouts.

However, feel free to run this application locally though with the instructions below and your own API keys and everything will work!

<br/>

## How to Use

Trainer's Ally has been designed to be as simple as possible yet still VERY powerful. Here are the step by step instructions for how to generate a week's worth of very customized workouts for a client in only minutes:

1. Click on the "New Workout" button on the left side chat panel.
2. Enter in all the required inputs for the workout, such as the client's goals, access to gym equipment, preferred workouts, etc.
3. Click "Generate Workouts"
4. After the first day's workout is generated, you can either continue with the next day or have the AI revise with or without feedback from you.
5. If you want to just move on to the next day, feel free to select any exercise alternatives before doing so.
6. If you decide to revise the workout, the AI will make the revisions and produce the new workout. Feel free to select alternatives here before moving to the next day.
7. After going through this process for each day, the AI will then produce a final list of all the workouts for the week where you can still select any final exercise alternatives.
8. From here, feel free to bring the workouts into your personal training app such as Everfit!

<br/>

## Technical Details

The Large Language Model used by the LangChain agents that generate and revise the workouts is [LLama3-70b-instruct](https://catalog.ngc.nvidia.com/orgs/nim/teams/meta/containers/llama3-70b-instruct) hosted by [Nvidia NIMS](https://www.nvidia.com/en-us/ai/).

The agents built with [LangChain](https://www.langchain.com/) are set up to interact together and accept human feedback through a backend application leveraging [LangGraph](https://langchain-ai.github.io/langgraph/) and hosted with [LangServe](https://python.langchain.com/v0.2/docs/langserve/) so that all the power of the graph sits behind a single API endpoint. Below is a slightly simplified visualization of the graph where you can see the agent nodes for generating and revising workouts and how they are connected:

<div align="center" style="margin-top: 25px;margin-bottom:25px">
<img width="300" alt="Trainers Ally LangGraph graph" src="https://i.imgur.com/Nq7Fctg.png">
</div>

The frontend for this application is a Next.JS application that uses the [Vercel AI SDK](https://sdk.vercel.ai/docs/introduction) to stream outputs from the LangServe endpoint and turn them into React components to beautifully display the workouts generated and accept exercise alternatives and workout feedback through [React Hook Form](https://react-hook-form.com/) forms.

The LangServe endpoint is hosted on [DigitalOcean](https://www.digitalocean.com/), and the frontend application is hosted on [Vercel](https://vercel.com/).

<br/>

## Running Backend Locally

The backend of Trainer's Ally is simply a LangServe endpoint that hosts a LangGraph runnable.

The backend of this application is found in the backend folder at the root of this repository.

You will need to use the environment variables [defined in `backend/.env.example`](/backend/.env.example) to run the backend. Turn the .env.example file into a `.env` file, and supply the necessary environment variables. The Nvidia API Key and "Use Nvidia" (set this to 'yes' to use Nvidia NIMS) environment variables are required. The optional GROQ API Key is only there to show that other LLMs can be used. The LangChain API key is there for optional LangSmith tracing. For the KV environment variables, see the instructions below for setting up the frontend.

After setting up the .env file, run the below commands to create a Python virtual environment and install the necessary Python packages to run the LangServe endpoint. Note that this requires you to already have Python and PIP installed on your system.

```bash
python -m venv trainers-ally-venv

On Windows: .\trainers-ally-venv\Scripts\activate
On MacOS/Linux: source trainers-ally-venv/bin/activate

cd backend
pip install -r requirements.txt
```

Then, run the following Python command (while in the backend directory) to host the LangServe endpoint (/workout) on port 8000:

```bash
python trainers-ally-ai-endpoints.py
```

<br/>

## Running Frontend Locally

Creating a KV Database Instance:

Follow the steps outlined in the [quick start guide](https://vercel.com/docs/storage/vercel-kv/quickstart#create-a-kv-database) provided by Vercel. This guide will assist you in creating and configuring your KV database instance on Vercel, enabling your application to interact with it.

Remember to update your environment variables (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`) in the `.env` file with the appropriate credentials provided during the KV database setup.

After creating a KV Database Instance:

You will need to use the environment variables [defined in `.env.example`](.env.example) to run the Trainer's Ally frontend. Turn the .env.example file into a `.env` file and populate all the environment variables with your own values.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various OpenAI and authentication provider accounts.

Finally, to install the necessary NPM packages for the frontend and start it, run the following commands while your current directory is the root of the repo. Note that this assumes you already have Node, NPM, and PNPM installed on your system. Feel free to use NPM instead of PNPM commands as well:

```bash
pnpm install
pnpm dev
```

Trainer's Ally should now be running on [localhost:3000](http://localhost:3000/)!

<br/>

## Future Work

At this point, Trainer's Ally is a powerful demonstration of how AI Agents can be used to perform complex tasks (in this case creating workouts for clients) alongside humans. 

However, there is definitely a lot more work to be done still to make this application customer ready! I am determined to make this a full-fledged production application and not just a winning submission for the Nvidia AI Agents Developer Contest, so I wanted to list out the future work here that I will continue in the coming months!

- Add the ability to create clients within the app, where each client will have workout history. This will also allow prefilling the workout generator input form based on the client profile.
- Add the ability to create custom exercise alternatives instead of just being able to select from the AI provided alternatives.
- Add the ability to adjust any number in an exercise, such as the number of sets, time, or reps.
- Make the application mobile-friendly. Currently this application is "disabled" on mobile with a message that says to use the desktop version.
- Add a pricing structure for generating workouts to make this application customer ready. This includes creating more robust authentication and user management.
- Make the UX even better by providing users with even more updates as workouts are being generated or revised.
- Add the ability to generate an entire week's worth of workouts without interrupting after each day.
- Handle errors better in the LangGraph backend and have a better toast system for displaying any errors in the frontend.
- Add more safety measures to the backend to prevent long running workout generating sessions.
- Add the ability to chat with a fine-tuned LLM to ask questions about the workouts or anything related to fitness to help provide better feedback for workout generation.
- Make the UI more concise - right now each workout takes up a lot of space in the chat history.

<br/>

## Authors

This application was created by [Cole Medin](https://www.youtube.com/channel/UCMwVTLZIRRUyyVrkjDpn4pA) for the Nvidia AI Agents Developer Contest hosted by Nvidia and LangChain.
