from flask import Flask, request
from flask_cors import CORS
from PyPDF2 import PdfReader
import io
from bs4 import BeautifulSoup
import requests

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

@app.route('/extract-text-from-pdf', methods=['POST'])
def extract_text():
    file = request.files['file']
    if file:
        pdf_file_obj = io.BytesIO(file.read())
        pdf_reader = PdfReader(pdf_file_obj)
        text = ""
        for page_num in range(len(pdf_reader.pages)):
            page_obj = pdf_reader.pages[page_num]
            text += page_obj.extract_text()
        return text.strip()

    return "No file received"

@app.route('/extract-text-from-url', methods=['POST'])
def extract_text_from_url():
    url = request.form.get('url')
    if url:
        print(url)
        headers = {"User-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36"}
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')

        # get text
        text = soup.get_text()

        # return data
        return text.strip()

    return "No URL provided", 400


if __name__ == '__main__':
    app.run(port=3004)
