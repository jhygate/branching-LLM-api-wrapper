import { Component } from '@angular/core';
import { BranchingChatComponent } from './branching-chat/branching-chat.component';

@Component({
  selector: 'app-root',
  imports: [BranchingChatComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'chat-frontend';
}
