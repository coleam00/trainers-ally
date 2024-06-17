from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_groq import ChatGroq
import requests
import json
import os

from prompts import day_workout_system_prompt, day_workout_user_prompt, day_workout_reviser_system_prompt, day_workout_reviser_user_prompt, should_revise_workout_system_prompt, should_revise_workout_user_prompt

# Maps the agent to the attributes that define it - the prompts, input variables, and output type (string or JSON)
chain_name_mapping = {
    "day_workout_generator": {
        "system": day_workout_system_prompt,
        "user": day_workout_user_prompt,
        "input_variables": ["day", "phase", "workouts_in_week", "workout_length", "extra_criteria", "created_workouts", "client_info"],
        "output_type": "JSON"
    },
    "day_workout_reviser_generator": {
        "system": day_workout_reviser_system_prompt,
        "user": day_workout_reviser_user_prompt,
        "input_variables": ["day", "phase", "workouts_in_week", "workout_length", "extra_criteria", "current_workout", "created_workouts", "client_info", "user_feedback"],
        "output_type": "JSON"
    },
    "should_revise_workout": {
        "system": should_revise_workout_system_prompt,
        "user": should_revise_workout_user_prompt,
        "input_variables": ["day", "workouts_in_week", "workout_length", "extra_criteria", "current_workout", "created_workouts", "client_info"],
        "output_type": "STR"
    }
}

# Can use Nvidia NIMS or GROQ - used GROQ during testing sometimes to avoid using up Nvidia credits
using_nvidia = os.environ['USING_NVIDIA'] == "yes"

kv_rest_api_url = os.environ["KV_REST_API_URL"]
kv_rest_api_token = os.environ["KV_REST_API_TOKEN"]

GROQ_LLM = ChatGroq(model="llama3-70b-8192")
NVIDIA_LLM = ChatNVIDIA(model="meta/llama3-70b-instruct")

def format_workouts(workouts):
  """
  Formats a workout JSON object into something more readable by humans and LLMs
  Args:
      workouts (dict): the workout JSON object that needs to be formatted
  Returns:
      str: the formatted workout
  """
  return "".join([f"Day {i + 1} workout:\n\n {json.dumps(w, indent=2)}\n\n\n\n" for i,w in enumerate(workouts)])

def format_message_llama(role, message, is_complete=True):
  """
  Formats a message for the non-chat version of Llama that uses special tokens
  Args:
      role (str): the message role (system, user, or assistant)
      message (str): the message content
      is_complete (bool): whether or not this is the last message so the END token is required
  Returns:
      str: the formatted workout
  """
  end_turn = ""

  if is_complete:
      end_turn = "\n<|eot_id|>"

  return f"<|start_header_id|>{role}<|end_header_id|>\n{message}{end_turn}"

def format_prompt_llama(messages):
  """
  Formats a set of messages for a non-chat Llama prompt where special tokens are required
  Args:
      message (List[str]): the messages that need to be formatted
  Returns:
      str: all of the messages combined into a single string prompt
  """  
  request = []

  for (role, message) in messages:
      msg = format_message_llama(role, message)
      request.append(msg)

  request.append(format_message_llama("assistant", "", is_complete=False))

  return "<|begin_of_text|>" + "\n".join(request)  

def get_chain(chain_name):
  """
  Accepts a chain (agent) name, and returns the LangChain chain with the
  prompt piped into the LLM which is piped into the necessary output parser
  Args:
      chain_name (str): the name of the chain (i.e. agent)
  Returns:
      chain: the LangChain chain for the agent requested based on the chain name
  """   
  chain_data = chain_name_mapping[chain_name]

  prompt_messages = [
      ("system", chain_data["system"]),
      ("user", chain_data["user"])
  ]

  if using_nvidia:
      prompt = ChatPromptTemplate.from_messages(prompt_messages)
  else:
      prompt = PromptTemplate(
          template=format_prompt_llama(prompt_messages),
          input_variables=chain_data["input_variables"]
      )
  
  LLM = NVIDIA_LLM if using_nvidia else GROQ_LLM  
  parser = StrOutputParser() if chain_data["output_type"] == "STR" else JsonOutputParser()
  chain = prompt | LLM | parser

  return chain

def get_latest_state_from_chat(chat_id):
  """
  Fetches the latest state of the chat from the Vercel KV database based on last chat message 
  Args:
      chat_id (str): the ID of the chat to fetch the latest state from
  Returns:
      dict: the latest state which matches the schema for the LangGraph graph
  """   
  try:
    response = requests.get(
        f'{kv_rest_api_url}/hgetall/chat:{chat_id}',
        headers={
            'Authorization': f'Bearer {kv_rest_api_token}'
        }
    )

    result = response.json()["result"]

    if "messages" not in result:
      return None

    messages = result[result.index("messages") + 1]
    messages_json = json.loads(messages)
    latest_state = messages_json[-1]["content"][0]["state"]
    
    return latest_state
  except Exception as e:
    print(e)
    return None
