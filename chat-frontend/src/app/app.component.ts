import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChatComponent } from './chat/chat.component';
import { BranchingChatComponent } from './branching-chat/branching-chat.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChatComponent, BranchingChatComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'chat-frontend';
}
