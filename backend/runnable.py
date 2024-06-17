from langgraph.checkpoint.memory import MemorySaver
from firebase_admin import credentials, firestore
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict
from typing import List
import firebase_admin
import time

from helpers import get_chain, format_workouts, get_latest_state_from_chat

# Initialize Firebase Admin SDK
credential_path = 'credentials/firebaseCreds.json'
cred = credentials.Certificate(credential_path)
firebase_admin.initialize_app(cred)

# Connect to Firestore
db = firestore.client()

### State
class GraphState(TypedDict):
  """
  Represents the state of our graph.

  Attributes:
    day: the current day a workout is being created for
    phase: the phase for the workout which changes the type of workouts
    workouts_in_week: the number of workouts to create for the week
    workout_length: the goal length for each workout
    extra_criteria: any extra criteria for creating the workouts
    current_workout: the most recent workout created by the LLM
    created_workouts: the set of workouts created for the week so far
    client_info: information about the client the workouts are being created for
    user_feedback: the feedback the user gave on the latest workout
    done : whether or not all workouts have been created or not
    thread_id : the ID of the thread for the current execution of the graph
  """
  day : int
  phase: int
  workouts_in_week : int
  workout_length : str
  extra_criteria : str
  current_workout : dict
  created_workouts : List[dict]
  client_info : str
  user_feedback : str
  done : bool
  thread_id : str

def entrypoint(state):
  """
  Entrypoint the graph.
  Args:
      state (dict): The current graph state
  Returns:
      dict: The updated state just to give something back to the frontend
  """

  print("---ENTRYPOINT---")
  created_workouts = state["created_workouts"]
  return {"created_workouts": created_workouts}

def workout_generator(state):
  """
  Agent to generate a workout for a single day
  Args:
      state (dict): The current graph state
  Returns:
      dict: The updated day, the workout created, and an updated list of the workouts generated
  """

  print("---WORKOUT GENERATOR---")
  # Get all the info needed to create the workout
  day = state["day"]
  phase = state["phase"]
  workouts_in_week = state["workouts_in_week"]
  workout_length = state["workout_length"]
  extra_criteria = state["extra_criteria"]
  created_workouts = state["created_workouts"]
  client_info = state["client_info"]
  day += 1

  # Fetch the day workout generator agent
  day_workout_generator = get_chain("day_workout_generator")

  # Generate the initial summary
  workout = day_workout_generator.invoke({
    "day": day,
    "phase": phase,
    "workouts_in_week": workouts_in_week,
    "workout_length": workout_length,
    "extra_criteria": extra_criteria,
    "created_workouts": format_workouts(created_workouts),
    "client_info": client_info
  })

  return {"day": day, "current_workout": workout, "created_workouts": created_workouts + [workout]}    

def post_workout_generator(state):
  """
  Agent to process the user feedback and workout edits after a user revised a generated workout
  Args:
      state (dict): The current graph state
  Returns:
      dict: The updated workout, list of created workouts, and user feedback fetched from the database
  """

  created_workouts = state["created_workouts"]
  current_workout = state["current_workout"]
  user_feedback = state["user_feedback"]
  thread_id = state["thread_id"]

  # Fetch the latest state of the frontend from the Vercel KV
  lastest_state = get_latest_state_from_chat(thread_id)
  current_workout = lastest_state.get("current_workout", current_workout)
  user_feedback = lastest_state.get("user_feedback", user_feedback)

  print(f"User feedback in post processor is: {user_feedback}")

  return {"created_workouts": created_workouts[:-1] + [current_workout], "current_workout": current_workout, "user_feedback": user_feedback}    

def revised_workout_generator(state):
  """
  Agent to revise a workout for a single day
  Args:
      state (dict): The current graph state
  Returns:
      dict: The revised workout, and an updated list of the workouts generated
  """

  print("---REVISED WORKOUT GENERATOR---")
  # Get all the info needed to create the workout
  day = state["day"]
  phase = state["phase"]
  workouts_in_week = state["workouts_in_week"]
  workout_length = state["workout_length"]
  extra_criteria = state["extra_criteria"]
  current_workout = state["current_workout"]
  created_workouts = state["created_workouts"]
  client_info = state["client_info"]
  user_feedback = state["user_feedback"]

  # Get the revised workout generator chain
  day_workout_reviser_generator = get_chain("day_workout_reviser_generator")

  # Generate the initial summary
  revised_workout = day_workout_reviser_generator.invoke({
    "day": day,
    "phase": phase,
    "workouts_in_week": workouts_in_week,
    "workout_length": workout_length,
    "extra_criteria": extra_criteria,
    "current_workout": current_workout,
    "created_workouts": format_workouts(created_workouts[:-1]),
    "client_info": client_info,
    "user_feedback": user_feedback
  })

  return {"current_workout": revised_workout, "created_workouts": created_workouts[:-1] + [revised_workout]}  

def post_workout_reviser(state):
  """
  Agent to process the workout edits (alternatives selected) after a user reviewed a revised workout
  Args:
      state (dict): The current graph state
  Returns:
      dict: The updated workout, list of created workouts, and user feedback fetched from the database
  """

  created_workouts = state["created_workouts"]
  current_workout = state["current_workout"]
  user_feedback = state["user_feedback"]
  thread_id = state["thread_id"]

  # Fetch the latest state of the frontend from the Vercel KV
  lastest_state = get_latest_state_from_chat(thread_id)
  current_workout = lastest_state.get("current_workout", current_workout)
  user_feedback = lastest_state.get("user_feedback", user_feedback)

  return {"created_workouts": created_workouts[:-1] + [current_workout], "current_workout": current_workout, "user_feedback": user_feedback}     

def result_generator(state):
  """
  Ending node just to signal to the frontend that the graph is done generating workouts for the week
  Args:
      state (dict): The current graph state
  Returns:
      dict: The final set of workouts and a flag to signal that the graph is done
  """

  print("---RESULT GENERATOR---")
  # Get all the info needed to display the final workout plan for the week
  created_workouts = state["created_workouts"]

  return {"created_workouts": created_workouts, "done": True}    

def route_to_revise_workout(state):
  """
  Route workout to revise or not.
  Args:
      state (dict): The current graph state
  Returns:
      str: Next node to call (revise workout, move to next day, or print final result)
  """

  print("---ROUTER TO REVISE OR NOT REVISE WORKOUT---")
  # Get all the info needed to create the workout
  day = state["day"]
  phase = state["phase"]
  workouts_in_week = state["workouts_in_week"]
  workout_length = state["workout_length"]
  extra_criteria = state["extra_criteria"]
  current_workout = state["current_workout"]
  created_workouts = state["created_workouts"]
  user_feedback = state["user_feedback"]
  client_info = state["client_info"]

  should_revise_workout = "REVISE" if user_feedback != "CONTINUE" else "NA"

  if should_revise_workout == "REVISE":
    print("---ROUTE TO REVISE WORKOUT---")
    return "revise"
  elif day >= workouts_in_week:
    return "results"
  else:
    print("---ROUTE TO CREATE NEXT WORKOUT---")
    return "nextday"    

def route_to_results(state):
  """
  Route to create next workout or show the final workout.
  Args:
      state (dict): The current graph state
  Returns:
      str: Next node to call (move to next day, or print final result)
  """

  print("---ROUTE TO RESULT WORKOUT---")
  # Get all the info needed to determine if the last workout was created
  day = state["day"]
  workouts_in_week = state["workouts_in_week"]

  print(f"Day is: {day}")

  # If all workouts have been created for the day, go to the results node.
  # Otherwise, move on to create the workout for the next day.
  if day >= workouts_in_week:
    return "results"
  else:
    print("---ROUTE TO CREATE NEXT WORKOUT---")
    return "nextday"     

def get_runnable():
  workflow = StateGraph(GraphState)

  # Define the nodes and how they connect
  workflow.add_node("entrypoint", entrypoint)
  workflow.add_node("workout_generator", workout_generator)
  workflow.add_node("post_workout_generator", post_workout_generator)
  workflow.add_node("revised_workout_generator", revised_workout_generator)
  workflow.add_node("post_workout_reviser", post_workout_reviser)
  workflow.add_node("result_generator", result_generator)

  workflow.set_entry_point("entrypoint")

  workflow.add_edge("entrypoint", "workout_generator")
  workflow.add_edge("workout_generator", "post_workout_generator")
  workflow.add_conditional_edges(
      "post_workout_generator",
      route_to_revise_workout,
      {
          "revise": "revised_workout_generator",
          "results": "result_generator",
          "nextday": "workout_generator"
      },
  )
  workflow.add_edge("revised_workout_generator", "post_workout_reviser")
  workflow.add_conditional_edges(
      "post_workout_reviser",
      route_to_results,
      {
          "results": "result_generator",
          "nextday": "workout_generator"
      },
  )
  workflow.add_edge("result_generator", END)

  # Compile the LangGraph graph into a runnable
  app = workflow.compile(checkpointer=MemorySaver(), interrupt_after=["workout_generator", "revised_workout_generator"])

  return app