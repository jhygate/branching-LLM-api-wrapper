import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent {
  messages: any[] = [];
  userInput: string = '';
  loading = false;

  constructor(private http: HttpClient) {}

  sendMessage() {
    if (!this.userInput.trim()) return;
    this.messages.push({ role: 'user', content: this.userInput });
    this.loading = true;
    this.http.post<any>('http://localhost:5000/chat', { messages: this.messages })
      .subscribe({
        next: (res) => {
          this.messages.push({ role: 'assistant', content: res.reply });
          this.userInput = '';
          this.loading = false;
        },
        error: (err) => {
          this.messages.push({ role: 'assistant', content: 'Error: ' + (err.error?.error || 'Unknown error') });
          this.loading = false;
        }
      });
  }
}
