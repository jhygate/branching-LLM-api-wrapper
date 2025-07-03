from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
import os

app = Flask(__name__)
CORS(app)

openai_api_key = os.environ.get("OPENAI_API_KEY")

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json(force=True)
    context = data.get("context", [])
    new_message = data.get("message")

    if not new_message:
        return jsonify({'error': 'No message provided'}), 400

    # Compose the full message list for OpenAI
    full_messages = context + [{"role": "user", "content": new_message}]

    try:
        client = openai.OpenAI(api_key=openai_api_key)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=full_messages,
            stream=False
        )
        assistant_reply = response.choices[0].message.content
        return jsonify({'response': assistant_reply})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
