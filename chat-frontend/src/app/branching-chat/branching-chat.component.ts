import { Component, OnInit, ElementRef, ViewChild, NgZone, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import 'highlight.js/styles/github-dark.css';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);

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
  isMiddlePanning = false;
  middlePanStart = { x: 0, y: 0 };
  middlePanOffsetStart = { x: 0, y: 0 };
  apiKey: string = '';
  showKey = false;
  provider: 'openai' | 'gemini' = 'openai';
  geminiApiKey: string = '';
  geminiApiVersion: string = 'v1';
  geminiModel: string = 'gemini-2.0-flash';

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    // On first load, center canvas at (0,0)
    if (Object.keys(this.nodes).length === 0) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.canvasOffset.x = vw / 2;
      this.canvasOffset.y = vh / 2;
      this.zoom = 1;
    }
    this.restoreFromSession();
    // Load API key from sessionStorage if present
    const savedKey = sessionStorage.getItem('openai-api-key');
    if (savedKey) {
      this.apiKey = savedKey;
    }
    const savedGeminiKey = sessionStorage.getItem('gemini-api-key');
    if (savedGeminiKey) {
      this.geminiApiKey = savedGeminiKey;
    }
    const savedProvider = sessionStorage.getItem('chat-provider');
    if (savedProvider === 'gemini' || savedProvider === 'openai') {
      this.provider = savedProvider;
    }
    const savedGeminiVersion = sessionStorage.getItem('gemini-api-version');
    if (savedGeminiVersion) {
      this.geminiApiVersion = savedGeminiVersion;
    }
    const savedGeminiModel = sessionStorage.getItem('gemini-model');
    if (savedGeminiModel) {
      this.geminiModel = savedGeminiModel;
    }
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

  setApiKey(key: string) {
    this.apiKey = key;
    sessionStorage.setItem('openai-api-key', key);
  }

  setProvider(provider: 'openai' | 'gemini') {
    this.provider = provider;
    sessionStorage.setItem('chat-provider', provider);
  }

  setGeminiApiKey(key: string) {
    this.geminiApiKey = key;
    sessionStorage.setItem('gemini-api-key', key);
  }

  setGeminiApiVersion(version: string) {
    this.geminiApiVersion = version;
    sessionStorage.setItem('gemini-api-version', version);
  }

  setGeminiModel(model: string) {
    this.geminiModel = model;
    sessionStorage.setItem('gemini-model', model);
  }

  async sendMessage(node: ChatNode, event?: Event) {
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
    for (let i = 0; i < ancestors.length - 1; i++) {
      const ancestor = ancestors[i];
      if (ancestor.title) {
        context.push({ role: 'system', content: `Branch name: ${ancestor.title}` });
      }
      context.push(...ancestor.messages);
    }
    context.push(...node.messages.slice(0, -1));
    try {
      if (this.provider === 'openai') {
        if (!this.apiKey) {
          node.messages.push({ role: 'assistant', content: 'Please enter your OpenAI API key.' });
          node.loading = false;
          this.saveToSession();
          return;
        }
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              ...context,
              { role: 'user', content: message }
            ],
            temperature: 0.7
          })
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || response.statusText);
        }
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || '[No response]';
        node.messages.push({ role: 'assistant', content: reply });
      } else if (this.provider === 'gemini') {
        if (!this.geminiApiKey) {
          node.messages.push({ role: 'assistant', content: 'Please enter your Gemini API key.' });
          node.loading = false;
          this.saveToSession();
          return;
        }
        const geminiContext = [
          ...context.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })),
          { role: 'user', parts: [{ text: message }] }
        ];
        const endpoint = `https://generativelanguage.googleapis.com/${this.geminiApiVersion}/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: geminiContext })
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || response.statusText);
        }
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '[No response]';
        node.messages.push({ role: 'assistant', content: reply });
      }
      node.loading = false;
    } catch (err: any) {
      node.messages.push({ role: 'assistant', content: 'Error: ' + (err.message || 'Unknown error') });
      node.loading = false;
    }
    this.saveToSession();
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
    this.clampNodePosition(child);
    node.children.push(child);
    this.nodes[child.id] = child;
    node.active = false; // parent becomes readonly
    this.cdr.detectChanges();

    this.saveToSession();
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

    this.saveToSession();
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

    this.saveToSession();
  }

  onMouseDown(event: MouseEvent) {
    // Middle mouse panning (anywhere)
    if (event.button === 1) {
      event.preventDefault();
      this.isMiddlePanning = true;
      this.middlePanStart = { x: event.clientX, y: event.clientY };
      this.middlePanOffsetStart = { ...this.canvasOffset };
      window.addEventListener('mousemove', this.onMiddlePanMove);
      window.addEventListener('mouseup', this.onMiddlePanUp);
      return;
    }
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
    this.saveToSession();
  }

  onMiddlePanMove = (event: MouseEvent) => {
    if (this.isMiddlePanning) {
      this.canvasOffset.x = this.middlePanOffsetStart.x + (event.clientX - this.middlePanStart.x);
      this.canvasOffset.y = this.middlePanOffsetStart.y + (event.clientY - this.middlePanStart.y);
    }
  };

  onMiddlePanUp = (_event: MouseEvent) => {
    if (this.isMiddlePanning) {
      this.isMiddlePanning = false;
      window.removeEventListener('mousemove', this.onMiddlePanMove);
      window.removeEventListener('mouseup', this.onMiddlePanUp);
      this.saveToSession();
    }
  };

  onWheel(event: WheelEvent) {
    if (event.metaKey) { // Cmd (Mac) pressed
      event.preventDefault();
      const oldZoom = this.zoom;
      let newZoom = this.zoom;
      const zoomStep = 0.03;
      if (event.deltaY < 0) {
        newZoom = Math.min(this.maxZoom, this.zoom + zoomStep);
      } else if (event.deltaY > 0) {
        newZoom = Math.max(this.minZoom, this.zoom - zoomStep);
      }
      if (newZoom !== oldZoom) {
        // Zoom centered on mouse pointer (viewport coordinates)
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        // Canvas coordinates under mouse before zoom
        const canvasX = (mouseX - this.canvasOffset.x) / oldZoom;
        const canvasY = (mouseY - this.canvasOffset.y) / oldZoom;
        // Update zoom
        this.zoom = newZoom;
        // Adjust offset so the canvas point under the mouse stays fixed
        this.canvasOffset.x = mouseX - canvasX * newZoom;
        this.canvasOffset.y = mouseY - canvasY * newZoom;
        this.saveToSession();
      }
    }
    // If metaKey not pressed, do nothing (allow default scroll/pan)
  }

  onNodeMouseDown(event: MouseEvent, node: ChatNode) {
    // Middle mouse panning (anywhere)
    if (event.button === 1) {
      event.preventDefault();
      this.isMiddlePanning = true;
      this.middlePanStart = { x: event.clientX, y: event.clientY };
      this.middlePanOffsetStart = { ...this.canvasOffset };
      window.addEventListener('mousemove', this.onMiddlePanMove);
      window.addEventListener('mouseup', this.onMiddlePanUp);
      return;
    }
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
      this.clampNodePosition(this.draggedNode);
    }
  };

  onNodeMouseUp = (_event: MouseEvent) => {
    this.dragging = false;
    this.draggedNode = null;
    document.body.classList.remove('dragging-node');
    window.removeEventListener('mousemove', this.onNodeMouseMove);
    window.removeEventListener('mouseup', this.onNodeMouseUp);
    this.saveToSession();
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
      this.clampNodePosition(this.resizingNode);
    }
  };

  onResizeMouseUp = (_event: MouseEvent) => {
    this.resizingNode = null;
    window.removeEventListener('mousemove', this.onResizeMouseMove);
    window.removeEventListener('mouseup', this.onResizeMouseUp);
    this.saveToSession();
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
      this.saveToSession();
    }
  }

  cancelEditing() {
    this.editingNode = null;
    this.editingName = '';
  }

  formatMessage(content: string): SafeHtml {
    // Configure marked to properly handle links
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    
    // Use marked to parse markdown, then sanitize
    const html = (marked as any).parseSync ? (marked as any).parseSync(content) : marked.parse(content);
    
    // Ensure links open in new tab and are properly styled
    const processedHtml = html.replace(
      /<a\s+href=/gi, 
      '<a target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;" href='
    );
    
    return this.sanitizer.bypassSecurityTrustHtml(processedHtml);
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getAllNodes(): ChatNode[] {
    const nodes = Object.values(this.nodes);
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

    this.saveToSession();
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

    this.saveToSession();
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

    this.saveToSession();
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
        // Only fit if no offset/zoom saved (backward compatibility)
        if (data.canvasOffset && typeof data.canvasOffset.x === 'number' && typeof data.canvasOffset.y === 'number' && typeof data.zoom === 'number') {
          this.canvasOffset = data.canvasOffset;
          this.zoom = data.zoom;
        } else {
          this.fitCanvasToNodes();
        }
        this.cdr.detectChanges();
        this.saveToSession();
      } catch (err) {
        alert('Failed to load canvas: ' + err);
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be loaded again if needed
    input.value = '';
  }

  createNewRoot() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rootId = this.generateId();
    // If no nodes, center canvas at (0,0)
    if (Object.keys(this.nodes).length === 0) {
      this.canvasOffset.x = vw / 2;
      this.canvasOffset.y = vh / 2;
      this.zoom = 1;
    }
    // Calculate the center of the current view in new coordinates (canvas centered at 0,0)
    const viewCenterX = ((vw / 2 - this.canvasOffset.x) / this.zoom);
    const viewCenterY = ((vh / 2 - this.canvasOffset.y) / this.zoom);
    const newRoot: ChatNode = {
      id: rootId,
      messages: [],
      children: [],
      input: '',
      loading: false,
      active: true,
      x: viewCenterX - 180, // Center the node (half of width)
      y: viewCenterY - 90,  // Center the node (half of height)
      width: 360,
      height: 180
    };
    this.clampNodePosition(newRoot);
    this.nodes[rootId] = newRoot;
    // If this is the first root, set it as the main root
    if (!this.rootNode) {
      this.rootNode = newRoot;
    }
    this.cdr.detectChanges();
    this.saveToSession();
  }

  saveToSession() {
    const nodesToSave: any = {};
    for (const [id, node] of Object.entries(this.nodes)) {
      nodesToSave[id] = {
        ...node,
        children: node.children.map(child => child.id),
      };
    }
    const data = {
      nodes: nodesToSave,
      rootNodeId: this.rootNode?.id,
      canvasOffset: this.canvasOffset,
      zoom: this.zoom
    };
    sessionStorage.setItem('branching-chat-canvas', JSON.stringify(data));
  }

  restoreFromSession() {
    const dataStr = sessionStorage.getItem('branching-chat-canvas');
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      const loadedNodes: { [key: string]: ChatNode } = {};
      for (const [id, nodeData] of Object.entries<any>(data.nodes || {})) {
        loadedNodes[id] = {
          ...nodeData,
          children: [],
        };
      }
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
      // Only fit if no offset/zoom saved (backward compatibility)
      if (data.canvasOffset && typeof data.canvasOffset.x === 'number' && typeof data.canvasOffset.y === 'number' && typeof data.zoom === 'number') {
        this.canvasOffset = data.canvasOffset;
        this.zoom = data.zoom;
      } else {
        this.fitCanvasToNodes();
      }
      this.cdr.detectChanges();
    } catch (err) {
      // Ignore errors
    }
  }

  newCanvas() {
    this.nodes = {};
    this.rootNode = null;
    this.canvasOffset = { x: 0, y: 0 };
    this.zoom = 1;
    sessionStorage.removeItem('branching-chat-canvas');
    this.createNewRoot();
    this.cdr.detectChanges();
    this.saveToSession();
  }

  fitCanvasToNodes() {
    const nodes = Object.values(this.nodes);
    if (nodes.length === 0) {
      // Center canvas at (0,0) if no nodes
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.canvasOffset.x = vw / 2;
      this.canvasOffset.y = vh / 2;
      this.zoom = 1;
      this.cdr.detectChanges();
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    // Add some padding
    const padding = 60;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Clamp bounding box to canvas limits
    const canvasMin = -50000, canvasMax = 50000;
    minX = Math.max(minX, canvasMin);
    minY = Math.max(minY, canvasMin);
    maxX = Math.min(maxX, canvasMax);
    maxY = Math.min(maxY, canvasMax);

    // Calculate scale to fit
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nodesWidth = Math.max(1, maxX - minX);
    const nodesHeight = Math.max(1, maxY - minY);

    // If all nodes are at the same spot, center that spot and use zoom=1
    if (nodesWidth === 1 && nodesHeight === 1) {
      this.zoom = 1;
      this.canvasOffset.x = viewportWidth / 2 - minX;
      this.canvasOffset.y = viewportHeight / 2 - minY;
      this.cdr.detectChanges();
      return;
    }

    const scaleX = viewportWidth / nodesWidth;
    const scaleY = viewportHeight / nodesHeight;
    const newZoom = Math.max(this.minZoom, Math.min(scaleX, scaleY, this.maxZoom));

    // Center the bounding box center in the viewport (canvas centered at 0,0)
    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;
    this.zoom = newZoom;
    this.canvasOffset.x = viewportWidth / 2 - bboxCenterX * newZoom;
    this.canvasOffset.y = viewportHeight / 2 - bboxCenterY * newZoom;
    this.cdr.detectChanges();
  }

  centerAll() {
    this.fitCanvasToNodes();
    this.cdr.detectChanges();
    this.saveToSession();
  }

  // Helper to clamp node position within canvas (centered at 0,0)
  clampNodePosition(node: ChatNode) {
    const minX = -50000;
    const maxX = 50000 - node.width;
    const minY = -50000;
    const maxY = 50000 - node.height;
    node.x = Math.max(minX, Math.min(node.x, maxX));
    node.y = Math.max(minY, Math.min(node.y, maxY));
  }
}
