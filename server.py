from flask import Flask, request
from flask_cors import CORS
from PyPDF2 import PdfReader
import io

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

@app.route('/extract-text', methods=['POST'])
def extract_text():
    file = request.files['file']
    if file:
        pdf_file_obj = io.BytesIO(file.read())
        pdf_reader = PdfReader(pdf_file_obj)
        text = ""
        for page_num in range(len(pdf_reader.pages)):
            page_obj = pdf_reader.pages[page_num]
            text += page_obj.extract_text()
        return text

    return "No file received"

if __name__ == '__main__':
    app.run(port=3004)
