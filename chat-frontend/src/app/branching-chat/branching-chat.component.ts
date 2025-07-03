import { Component, OnInit, ElementRef, ViewChild, NgZone, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import 'highlight.js/styles/github-dark.css';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);

const renderer = {
  code({ text, lang }: { text: string, lang?: string }): string {
    let highlighted = '';
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(text, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
    return `<pre><code class=\"hljs language-${lang || ''}\">${highlighted}</code></pre>`;
  }
};
marked.use({ renderer });

interface Message {
  role: string;
  content: string;
}

interface ChatNode {
  id: string;
  parentId?: string;
  children: ChatNode[];
  messages: Message[];
  input: string;
  loading: boolean;
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  manualHeight?: boolean;
}

@Component({
  selector: 'app-branching-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branching-chat.component.html',
  styleUrls: ['./branching-chat.component.css']
})
export class BranchingChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('titleInput', { static: false }) titleInputRef!: ElementRef<HTMLInputElement>;
  rootNode: ChatNode | null = null;
  nodes: { [key: string]: ChatNode } = {};
  apiUrl = 'http://localhost:5000';
  dragging = false;
  draggedNode: ChatNode | null = null;
  dragStart = { x: 0, y: 0 };
  dragNodeStart = { x: 0, y: 0 };
  canvasOffset = { x: 0, y: 0 };
  isDragging = false;
  editingNode: ChatNode | null = null;
  editingName = '';
  zoom = 1;
  minZoom = 0.01;
  maxZoom = 2;
  resizingNode: ChatNode | null = null;
  resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.createNewChat();
    document.addEventListener('mousedown', this.handleGlobalClick, true);
  }

  ngOnDestroy() {
    document.removeEventListener('mousedown', this.handleGlobalClick, true);
  }

  ngAfterViewChecked() {
    document.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
  }

  handleGlobalClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.title-input')) {
      if (this.editingNode) {
        this.finishEditing();
      }
    }
  };

  createNewChat() {
    this.createRoot();
  }

  createRoot() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rootId = this.generateId();
    const root: ChatNode = {
      id: rootId,
      messages: [],
      children: [],
      input: '',
      loading: false,
      active: true,
      x: vw * 1.5,
      y: vh * 1.5,
      width: 360,
      height: 180
    };
    this.rootNode = root;
    this.nodes[rootId] = root;
    // Set initial offset so the root node is centered in the viewport
    this.canvasOffset.x = (vw / 2) - root.x - (root.width / 2);
    this.canvasOffset.y = (vh / 2) - root.y - (root.height / 2);
    // Debug output
    console.log('Root node created at:', root.x, root.y);
    console.log('Initial canvas offset:', this.canvasOffset);
    console.log('Viewport size:', vw, vh);
    setTimeout(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement;
      if (canvas) {
        console.log('Canvas size:', canvas.offsetWidth, canvas.offsetHeight);
      }
    }, 100);
  }

  generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  onTitleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.editingName = target.value;
    }
  }

  sendMessage(node: ChatNode, event?: Event) {
    if (event && event instanceof KeyboardEvent && event.shiftKey) return;
    if (event) event.preventDefault();
    
    if (!node.input.trim() || !node.active || node.loading) return;
    
    const message = node.input.trim();
    node.messages.push({ role: 'user', content: message });
    node.input = '';
    node.loading = true;

    // Gather context: all ancestor names and messages up to root
    const context: { role: string; content: string }[] = [];
    let current: ChatNode | undefined = node;
    const ancestors: ChatNode[] = [];
    while (current) {
      ancestors.unshift(current);
      current = current.parentId ? this.nodes[current.parentId] : undefined;
    }
    // For each ancestor (except the current node), add its name as a system message and its messages
    for (let i = 0; i < ancestors.length - 1; i++) {
      const ancestor = ancestors[i];
      if (ancestor.title) {
        context.push({ role: 'system', content: `Branch name: ${ancestor.title}` });
      }
      context.push(...ancestor.messages);
    }
    // Add the current node's previous messages (not the just-added one)
    context.push(...node.messages.slice(0, -1));

    this.http.post<any>(`${this.apiUrl}/chat/${node.id}`, { message, context }).subscribe({
      next: (response) => {
        node.messages.push({ role: 'assistant', content: response.response });
        node.loading = false;
      },
      error: (err) => {
        node.messages.push({ role: 'assistant', content: 'Error: ' + (err.error?.error || 'Unknown error') });
        node.loading = false;
      }
    });
  }

  branch(node: ChatNode) {
    // Allow branching from any node, even if inactive
    const defaultWidth = 360, defaultHeight = 180;
    const childX = node.x + node.width + 40; // Place to the right of parent
    const childY = node.y; // Align vertically
    const newId = this.generateId();
    const child: ChatNode = {
      id: newId,
      parentId: node.id,
      messages: [],
      children: [],
      input: '',
      loading: false,
      active: true, // child is active
      x: childX,
      y: childY,
      width: defaultWidth,
      height: defaultHeight
    };
    node.children.push(child);
    this.nodes[child.id] = child;
    node.active = false; // parent becomes readonly
    this.cdr.detectChanges();
  }

  zoomIn() {
    if (this.zoom < this.maxZoom) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const canvasX = (centerX - this.canvasOffset.x) / this.zoom;
      const canvasY = (centerY - this.canvasOffset.y) / this.zoom;
      this.zoom = Math.min(this.maxZoom, this.zoom + 0.1);
      this.canvasOffset.x = centerX - canvasX * this.zoom;
      this.canvasOffset.y = centerY - canvasY * this.zoom;
    }
  }

  zoomOut() {
    if (this.zoom > this.minZoom) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const canvasX = (centerX - this.canvasOffset.x) / this.zoom;
      const canvasY = (centerY - this.canvasOffset.y) / this.zoom;
      this.zoom = Math.max(this.minZoom, this.zoom - 0.1);
      this.canvasOffset.x = centerX - canvasX * this.zoom;
      this.canvasOffset.y = centerY - canvasY * this.zoom;
    }
  }

  onMouseDown(event: MouseEvent) {
    // Only start panning if clicking directly on the canvas background, not inside a chat node
    const target = event.target as HTMLElement;
    if (event.currentTarget === target && !target.closest('.chat-node')) {
      this.isDragging = true;
      this.dragStart = { x: event.clientX - this.canvasOffset.x, y: event.clientY - this.canvasOffset.y };
    }
  }

  onMouseMove(event: MouseEvent) {
    if (this.isDragging) {
      this.canvasOffset.x = event.clientX - this.dragStart.x;
      this.canvasOffset.y = event.clientY - this.dragStart.y;
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
  }

  onNodeMouseDown(event: MouseEvent, node: ChatNode) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.classList.contains('resize-handle') ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.closest('button') ||
        target.closest('input')) {
      return;
    }
    this.dragging = true;
    this.draggedNode = node;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.dragNodeStart = { x: node.x, y: node.y };
    document.body.classList.add('dragging-node');
    window.addEventListener('mousemove', this.onNodeMouseMove);
    window.addEventListener('mouseup', this.onNodeMouseUp);
  }

  onNodeMouseMove = (event: MouseEvent) => {
    if (this.dragging && this.draggedNode) {
      this.draggedNode.x = this.dragNodeStart.x + (event.clientX - this.dragStart.x) / this.zoom;
      this.draggedNode.y = this.dragNodeStart.y + (event.clientY - this.dragStart.y) / this.zoom;
    }
  };

  onNodeMouseUp = (_event: MouseEvent) => {
    this.dragging = false;
    this.draggedNode = null;
    document.body.classList.remove('dragging-node');
    window.removeEventListener('mousemove', this.onNodeMouseMove);
    window.removeEventListener('mouseup', this.onNodeMouseUp);
  };

  onResizeMouseDown(event: MouseEvent, node: ChatNode) {
    event.stopPropagation();
    this.resizingNode = node;
    this.resizeStart = {
      x: event.clientX,
      y: event.clientY,
      width: node.width,
      height: node.height
    };
    node.manualHeight = true;
    window.addEventListener('mousemove', this.onResizeMouseMove);
    window.addEventListener('mouseup', this.onResizeMouseUp);
  }

  onResizeMouseMove = (event: MouseEvent) => {
    if (this.resizingNode) {
      const dx = (event.clientX - this.resizeStart.x) / this.zoom;
      const dy = (event.clientY - this.resizeStart.y) / this.zoom;
      const minWidth = 200, minHeight = 100;
      this.resizingNode.width = Math.max(minWidth, this.resizeStart.width + dx);
      this.resizingNode.height = Math.max(minHeight, this.resizeStart.height + dy);
    }
  };

  onResizeMouseUp = (_event: MouseEvent) => {
    this.resizingNode = null;
    window.removeEventListener('mousemove', this.onResizeMouseMove);
    window.removeEventListener('mouseup', this.onResizeMouseUp);
  };

  startEditing(node: ChatNode) {
    this.editingNode = node;
    this.editingName = node.title || 'Chat ' + node.id.slice(0, 8);
    
    // Auto-select text after the input is rendered
    setTimeout(() => {
      if (this.titleInputRef && this.titleInputRef.nativeElement) {
        this.titleInputRef.nativeElement.select();
      }
    }, 0);
  }

  finishEditing() {
    if (this.editingNode) {
      this.editingNode.title = this.editingName;
      this.editingNode = null;
      this.editingName = '';
    }
  }

  cancelEditing() {
    this.editingNode = null;
    this.editingName = '';
  }

  formatMessage(content: string): SafeHtml {
    // Use marked to parse markdown, then sanitize
    // Use parseSync if available, otherwise parse
    const html = (marked as any).parseSync ? (marked as any).parseSync(content) : marked.parse(content);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getAllNodes(): ChatNode[] {
    const nodes = Object.values(this.nodes);
    nodes.forEach(node => {
      console.log('Rendering node', node.id, 'at', node.x, node.y);
    });
    return nodes;
  }

  // Helper to render assistant message with code highlighting
  renderAssistantMessage(msg: string): SafeHtml {
    // Parse markdown code blocks: ```lang\ncode\n```
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let html = msg.replace(codeBlockRegex, (match, lang, code) => {
      const validLang = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(code, { language: validLang }).value;
      return `<pre class='chat-code-block'><code class='hljs ${validLang}'>${highlighted}</code></pre>`;
    });
    // Escape and replace newlines for non-code text
    html = html.replace(/\n/g, '<br/>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  onNodeDblClick(node: ChatNode) {
    this.startEditing(node);
  }

  saveNodeName(node: ChatNode, event?: Event) {
    this.finishEditing();
    if (event) event.preventDefault();
  }

  deleteNode(node: ChatNode) {
    if (!window.confirm('Delete this node and all its children?')) return;
    this.removeNodeAndChildren(node);
    this.cdr.detectChanges();
  }

  removeNodeAndChildren(node: ChatNode) {
    // Remove from parent's children
    if (node.parentId && this.nodes[node.parentId]) {
      const parent = this.nodes[node.parentId];
      parent.children = parent.children.filter(child => child.id !== node.id);
    }
    // Recursively delete children
    for (const child of node.children) {
      this.removeNodeAndChildren(child);
    }
    delete this.nodes[node.id];
    if (this.rootNode && this.rootNode.id === node.id) {
      this.rootNode = null;
    }
  }

  saveCanvas() {
    // Save nodes as a plain object with children as arrays of child IDs
    const nodesToSave: any = {};
    for (const [id, node] of Object.entries(this.nodes)) {
      nodesToSave[id] = {
        ...node,
        children: node.children.map(child => child.id), // Save only child IDs
      };
    }
    const data = {
      nodes: nodesToSave,
      rootNodeId: this.rootNode?.id,
      canvasOffset: this.canvasOffset,
      zoom: this.zoom
    };
    let fileName = window.prompt('Enter file name to save:', 'canvas.json') || 'canvas.json';
    if (!fileName.endsWith('.json')) fileName += '.json';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadCanvas(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Rebuild nodes map
        const loadedNodes: { [key: string]: ChatNode } = {};
        for (const [id, nodeData] of Object.entries<any>(data.nodes || {})) {
          loadedNodes[id] = {
            ...nodeData,
            children: [], // We'll fill this in next
          };
        }
        // Rebuild children arrays and parentId
        for (const [id, nodeData] of Object.entries<any>(data.nodes || {})) {
          if (Array.isArray(nodeData.children)) {
            loadedNodes[id].children = nodeData.children.map((childId: string) => loadedNodes[childId]).filter(Boolean);
            for (const childId of nodeData.children) {
              if (loadedNodes[childId]) {
                loadedNodes[childId].parentId = id;
              }
            }
          }
        }
        this.nodes = loadedNodes;
        this.rootNode = data.rootNodeId ? this.nodes[data.rootNodeId] : null;
        this.canvasOffset = data.canvasOffset || { x: 0, y: 0 };
        this.zoom = data.zoom || 1;
        this.cdr.detectChanges();
      } catch (err) {
        alert('Failed to load canvas: ' + err);
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be loaded again if needed
    input.value = '';
  }
}
