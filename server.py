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
