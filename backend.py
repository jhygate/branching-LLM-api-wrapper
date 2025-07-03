from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import openai
import os
import json
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

openai_api_key = os.environ.get("OPENAI_API_KEY")
SESSION_DIR = "sessions"
os.makedirs(SESSION_DIR, exist_ok=True)

def get_session_path(session_id):
    return os.path.join(SESSION_DIR, f"{session_id}.json")

def load_session(session_id):
    try:
        with open(get_session_path(session_id), 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_session(session_id, messages):
    with open(get_session_path(session_id), 'w') as f:
        json.dump(messages, f, indent=2)

@app.route('/chat/<session_id>', methods=['POST'])
def chat(session_id):
    data = request.get_json(force=True)
    messages = load_session(session_id)
    new_message = data.get("message")
    context = data.get("context", [])
    if context:
        full_messages = context + [{"role": "user", "content": new_message}]
    else:
        full_messages = messages + [{"role": "user", "content": new_message}]

    if not new_message:
        return jsonify({'error': 'No message provided'}), 400

    if new_message.strip() == "/save":
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        uid = str(uuid.uuid4())[:8]
        filename = f"chatlog-{timestamp}-{uid}.json"
        with open(filename, 'w') as f:
            json.dump(messages, f, indent=2)
        return jsonify({'response': f'Session saved as {filename}.'})

    # Append user message
    messages.append({"role": "user", "content": new_message})
    try:
        client = openai.OpenAI(api_key=openai_api_key)
        stream = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=full_messages,
            stream=True
        )
        assistant_reply = ""
        for chunk in stream:
            delta = getattr(chunk.choices[0].delta, 'content', None)
            if delta:
                assistant_reply += delta
        messages.append({"role": "assistant", "content": assistant_reply})
        save_session(session_id, messages)
        return jsonify({'response': assistant_reply})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/branch/<session_id>', methods=['POST'])
def branch(session_id):
    original_messages = load_session(session_id)
    new_session_id = str(uuid.uuid4())[:8]
    save_session(new_session_id, original_messages)
    return jsonify({'new_session_id': new_session_id})

@app.route('/sessions', methods=['GET'])
def list_sessions():
    files = os.listdir(SESSION_DIR)
    return jsonify({'sessions': [f.replace('.json', '') for f in files]})

if __name__ == '__main__':
    app.run(port=5000)
