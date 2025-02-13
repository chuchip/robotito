import { Injectable, resolveForwardRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class AudioRecorderService {
  private mediaRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private readonly backendUrl = 'http://localhost:5000'; // Change this to your backend

  constructor(private http: HttpClient) {}

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }

  async stopRecording(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.onstop = async () => {
          try {
            const message = await this.uploadAudio();
            resolve(message);
          } catch (error) {
            reject('Upload failed');
          }
        };

        this.mediaRecorder.stop();
        this.isRecording = false;
      } else {
        resolve('No active recording to stop');
      }
    });
  }

  async sendMsg(inputText:string): Promise<string>  {
    return new Promise((resolve, reject) => {  
      const payload = { text: inputText };
      this.http.post<{ message: string; text: string }>(`${this.backendUrl}/send-question`, payload).subscribe({
        next: (response) => {
          console.log('Send Msg OK:', response.text);
          resolve(response.text);
        },
        error: (error) => {
          console.error('Send Msg failed:', error);
          reject(error);
        }
      });     
    });
  }

  text_to_sound1(inputText:string) {
    const audioElement = new Audio();
    audioElement.src = `${this.backendUrl}/tts`;  // Flask endpoint
    audioElement.play();  //
  }
  async send_context(user:string,label:string,context:string):  Promise<Response> {      
    console.log("Set context: ",context)
    const response = await fetch(`${this.backendUrl}/set-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'user': user,'label':label,'context':context }),
    });    
    return  response;
  }

  async text_to_sound(inputText:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText }),
    });
   return response
  }
  async change_language(language:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language }),
    });
   return response
  }
  async clear_conversation() : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/clear`, {
      method: 'GET'      
    });
   return response
  }
  async get_last_user() : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/last_user`, {
      method: 'GET'      
    });
   return response
  }
  
  async get_contexts(user:string):  Promise<any> {   
      try {
        return await firstValueFrom(this.http.get(`${this.backendUrl}/get-contexts?user=${user}`));
      } catch (error) {
        console.error('get-contexts failed!:', error);
        throw error;
      }
 
  }
  private uploadAudio(): Promise<string> {
    return new Promise((resolve, reject) => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      this.http.post<{ message: string; text: string }>(`${this.backendUrl}/upload-audio`, formData).subscribe({
        next: (response) => {
          console.log('Upload successful:', response.text);
          resolve(response.text);
        },
        error: (error) => {
          console.error('Upload failed:', error);
          reject(error);
        }
      });

      this.audioChunks = [];
    });
  }
}
