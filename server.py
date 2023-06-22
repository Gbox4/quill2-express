from flask_cors import CORS
from flask import Flask, request, jsonify
from PyPDF2 import PdfReader
import docx
import io
import tabula
import csv

from bs4 import BeautifulSoup
import requests
from nltk import tokenize
from werkzeug.utils import secure_filename
from tabula import read_pdf

app = Flask(__name__)
CORS(app)  # This will enable CORS for all routes

# Give sentence split function a better name, returns a list of strings
split_into_sentences = tokenize.sent_tokenize


ALLOWED_EXTENSIONS = {'pdf', 'txt', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def read_pdf(file):
    pdf_file_obj = io.BytesIO(file.read())
    pdf_reader = PdfReader(pdf_file_obj)
    text = ""
    for page_num in range(len(pdf_reader.pages)):
        page_obj = pdf_reader.pages[page_num]
        text += page_obj.extract_text() + "\n"
    return text.strip()

def read_txt(file):
    return file.read().decode('utf-8')

def read_docx(file):
    doc = docx.Document(io.BytesIO(file.read()))
    full_text = []
    for paragraph in doc.paragraphs:
        full_text.append(paragraph.text)
    return '\n'.join(full_text)

@app.route('/upload-and-index-text', methods=['POST'])
def upload_and_index_text():
    if 'files[]' not in request.files:
        return jsonify({"error": "No file part"}), 400

    files = request.files.getlist('files[]')
    response = []

    for file in files:
        if file and allowed_file(file.filename):
            extension = file.filename.rsplit('.', 1)[1].lower()

            if extension == 'pdf':
                content = read_pdf(file)
            elif extension == 'txt':
                content = read_txt(file)
            elif extension == 'docx':
                content = read_docx(file)
            else:
                return jsonify({"error": "Unsupported file type"}), 400

            response.append({'filename': file.filename, 'content': content})

    print(response)
    return jsonify(response)



@app.route('/extract-text-from-pdf', methods=['POST'])
def extract_text_from_pdf():
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

@app.route('/extract-csv-from-pdf', methods=['POST'])
def extract_csv_from_pdf():
    # Check if a file is uploaded
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})

    pdf_file = request.files['file']

    # Check if the file is a PDF
    if not pdf_file.filename.endswith('.pdf'):
        return jsonify({'error': 'Invalid file format. Only PDF files are supported'})

    # Read the PDF file and extract tables
    tables = tabula.read_pdf(pdf_file, pages='all')

    # Convert tables to CSV strings
    csv_strings = []
    for table in tables:
        csv_string = table.to_csv(index=False)
        csv_strings.append(csv_string)

    return jsonify({'csv_strings': csv_strings})

@app.route('/extract-text-from-url', methods=['POST'])
def extract_text_from_url():
    url = request.form.get('url')
    if url:
        print(url)
        headers = {
            "authority": 'efts.sec.gov',
            "accept": '*/*',
            'accept-language': 'en-US,en;q=0.6',
            'content-type': 'application/json',
            "origin": 'https://www.sec.gov',
            "referer": 'https://www.sec.gov/',
            'sec-ch-ua': '"Not.A/Brand";v="8", "Chromium";v="114", "Brave";v="114"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'sec-gpc': '1',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        }
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')

        # get text
        text = soup.get_text()

        # return data
        return text.strip()

    return "No URL provided", 400


if __name__ == '__main__':
    app.run(port=3004)
