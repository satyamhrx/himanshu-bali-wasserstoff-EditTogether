import React, { useEffect, useState, useRef, useCallback } from 'react';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { inputRules } from 'prosemirror-inputrules';

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ySyncPlugin, yCursorPlugin } from 'y-prosemirror';
import Login from './Login';
import ChangeHistory from './ChangeHistory';
import './CollaborativeEditor.css';

interface Change {
  id: string;
  user: string;
  userColor: string;
  content: string;
  timestamp: Date;
}

// Create a schema with basic nodes and marks, plus list nodes
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks
});

// Create basic setup for the editor
const setup = () => {
  return [
    keymap(baseKeymap),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo
    }),
    inputRules({
      rules: []
    })
  ];
};

const CollaborativeEditor: React.FC = () => {
  const [username, setUsername] = useState<string>('');
  const [userColor, setUserColor] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Only create Y.Doc and Provider ONCE
  const ydocRef = useRef<Y.Doc>();
  const wsProviderRef = useRef<WebsocketProvider>();

  // Add state for tracking editor content
  const [hasContent, setHasContent] = useState(false);

  // Generate a color for the user
  useEffect(() => {
    if (!userColor) {
      setUserColor(`#${Math.floor(Math.random()*16777215).toString(16)}`);
    }
  }, [userColor]);

  // Handle connection status
  useEffect(() => {
    const handleStatus = ({ status }: { status: string }) => {
      setIsConnected(status === 'connected');
    };
    wsProviderRef.current?.on('status', handleStatus);
    return () => {
      wsProviderRef.current?.off('status', handleStatus);
      wsProviderRef.current?.destroy();
    };
  }, [wsProviderRef]);

  // Initialize ProseMirror editor
  useEffect(() => {
    console.log('Editor init effect - username:', username, 'editorRef:', editorRef.current);
    
    if (!editorRef.current) {
      console.error('Editor ref is not available');
      return;
    }
    
    if (!username) {
      console.log('Username not set yet');
      return;
    }

    try {
      // Create a new Y.Doc for this session if it doesn't exist
      if (!ydocRef.current) {
        ydocRef.current = new Y.Doc();
      }

      // Create WebSocket provider with error handling
      if (!wsProviderRef.current) {
        wsProviderRef.current = new WebsocketProvider(
          'ws://localhost:4321',
          'edit-together-doc',
          ydocRef.current,
          {
            connect: true,
            WebSocketPolyfill: WebSocket,
            resyncInterval: 5000, // Try to reconnect every 5 seconds
          }
        );

        // Handle WebSocket connection errors
        wsProviderRef.current.on('connection-error', (error: any) => {
          console.error('WebSocket connection error:', error);
          setIsConnected(false);
        });

        wsProviderRef.current.on('status', ({ status }: { status: string }) => {
          console.log('WebSocket status:', status);
          setIsConnected(status === 'connected');
        });
      }

      const yXmlFragment = ydocRef.current.get('prosemirror', Y.XmlFragment);
      console.log('Y.js fragment created');

      const plugins = [
        ...setup(),
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(wsProviderRef.current.awareness, {
          cursorBuilder: (user) => {
            const cursor = document.createElement('span');
            cursor.classList.add('collaboration-cursor');
            cursor.style.borderLeft = `2px solid ${user.color}`;
            cursor.style.borderRight = `2px solid ${user.color}`;
            cursor.style.marginLeft = '-1px';
            cursor.style.marginRight = '-1px';
            cursor.style.pointerEvents = 'none';
            cursor.style.position = 'relative';
            cursor.style.wordBreak = 'normal';

            const label = document.createElement('span');
            label.classList.add('collaboration-cursor__label');
            label.style.backgroundColor = user.color;
            label.style.position = 'absolute';
            label.style.top = '-1.4em';
            label.style.left = '-1px';
            label.style.fontSize = '12px';
            label.style.fontStyle = 'normal';
            label.style.fontWeight = '600';
            label.style.lineHeight = 'normal';
            label.style.userSelect = 'none';
            label.style.whiteSpace = 'nowrap';
            label.style.color = 'white';
            label.style.padding = '0.1rem 0.3rem';
            label.style.borderRadius = '3px';
            label.style.pointerEvents = 'none';
            label.textContent = user.name;
            cursor.appendChild(label);

            return cursor;
          }
        })
      ];

      // Create an empty paragraph node as initial content
      const emptyDoc = mySchema.node('doc', null, [
        mySchema.node('paragraph', null, [])
      ]);

      const state = EditorState.create({
        schema: mySchema,
        plugins,
        doc: emptyDoc
      });

      console.log('Editor state created');

      // Create a stable reference to the view
      let currentView: EditorView | null = null;

      const view = new EditorView(editorRef.current, {
        state,
        dispatchTransaction(transaction: Transaction) {
          if (!currentView) return;
          const newState = currentView.state.apply(transaction);
          currentView.updateState(newState);
          // Update hasContent state on every transaction
          const text = newState.doc.textContent;
          setHasContent(Boolean(text && text.trim()));
        }
      });

      // Set the stable reference
      currentView = view;
      viewRef.current = view;

      console.log('Editor view created');

      // Set awareness with user info
      wsProviderRef.current.awareness.setLocalStateField('user', {
        name: username,
        color: userColor
      });

      return () => {
        console.log('Cleaning up editor');
        if (currentView) {
          currentView.destroy();
          currentView = null;
        }
        if (wsProviderRef.current) {
          wsProviderRef.current.destroy();
          wsProviderRef.current = undefined;
        }
      };
    } catch (error) {
      console.error('Error initializing editor:', error);
    }
  }, [username, userColor]);

  const handleLogin = (name: string) => {
    setUsername(name);
  };

  const handleSubmitChange = useCallback(() => {
    console.log('[DEBUG] Submit button clicked');
    if (!viewRef.current || !hasContent) {
      console.log('[DEBUG] Cannot submit: No content or editor not ready');
      return;
    }

    try {
      // Get the current document content
      const doc = viewRef.current.state.doc;
      const content = doc.textContent || '';
      console.log('[DEBUG] Submitting content:', content);
      
      if (!content.trim()) {
        console.log('[DEBUG] No content to submit');
        return;
      }

      console.log('Submitting change:', content);

      // Create the change object
      const newChange: Change = {
        id: Date.now().toString(),
        user: username,
        userColor,
        content: content,
        timestamp: new Date(),
      };

      // Update changes state
      setChanges(prev => [newChange, ...prev].slice(0, 10));

      // Create empty document
      const emptyDoc = mySchema.node('doc', null, [
        mySchema.node('paragraph', null, [])
      ]);

      // Create and dispatch transaction to clear editor
      const tr = viewRef.current.state.tr.replaceWith(
        0,
        viewRef.current.state.doc.content.size,
        emptyDoc
      );

      // Apply the transaction
      viewRef.current.dispatch(tr);

      // Update content state
      setHasContent(false);

      // Show confirmation
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 1500);

      // Broadcast change to other users
      if (wsProviderRef.current?.awareness) {
        wsProviderRef.current.awareness.setLocalStateField('lastChange', {
          id: newChange.id,
          user: username,
          timestamp: newChange.timestamp,
          content: newChange.content
        });
      }

    } catch (error) {
      console.error('Error submitting change:', error);
      // Show error to user
      alert('Failed to submit change. Please try again.');
    }
  }, [username, userColor, mySchema, hasContent]);

  if (!username) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="collab-bg" style={{ minHeight: '100vh', minWidth: '100vw', width: '100vw', height: '100vh', background: 'linear-gradient(120deg, #f3f4f6 60%, #e0e7ff 100%)', padding: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', overflowX: 'hidden' }}>
      <div className="collab-topbar" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 2rem 1.1rem 2rem', background: 'white', boxShadow: '0 2px 8px 0 rgb(0 0 0 / 0.04)', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10, marginBottom: '0.5rem' }}>
        <div className="collab-app-title" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3730a3', letterSpacing: '0.01em' }}>Edit Together</div>
        <div className="collab-user-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="collab-user-dot" style={{ backgroundColor: userColor }} />
          <span className="collab-user-name">{username}</span>
        </div>
        <div className={`collab-connection-status ${isConnected ? 'connected' : 'disconnected'}`}
          style={{ padding: '0.3rem 1rem', borderRadius: '9999px', fontSize: '0.95rem', fontWeight: 500, background: isConnected ? '#dcfce7' : '#fee2e2', color: isConnected ? '#166534' : '#991b1b', border: isConnected ? '1px solid #bbf7d0' : '1px solid #fecaca', transition: 'background 0.2s, color 0.2s' }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div className="collab-main-card" style={{ margin: '0 auto', background: 'white', borderRadius: '1rem', boxShadow: '0 8px 32px 0 rgb(55 48 163 / 0.08)', display: 'flex', flexDirection: 'row', width: '70vw', height: '70vh', maxWidth: '900px', maxHeight: '700px', minHeight: '400px', overflow: 'hidden', boxSizing: 'border-box', marginTop: '1.5rem' }}>
        <div className="collab-editor-pane" style={{ flex: 2, padding: '1.25rem 1.25rem 1.25rem 1.75rem', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', height: '100%' }}>
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.addMark(0, viewRef.current.state.doc.content.size, mySchema.marks.strong.create()))} style={{ fontWeight: 'bold', fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '1.8rem' }}>B</button>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.addMark(0, viewRef.current.state.doc.content.size, mySchema.marks.em.create()))} style={{ fontStyle: 'italic', fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '1.8rem' }}>I</button>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.setBlockType(0, viewRef.current.state.doc.content.size, mySchema.nodes.heading, { level: 1 }))} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.2rem' }}>H1</button>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.setBlockType(0, viewRef.current.state.doc.content.size, mySchema.nodes.heading, { level: 2 }))} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.2rem' }}>H2</button>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.setBlockType(0, viewRef.current.state.doc.content.size, mySchema.nodes.bullet_list))} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.5rem' }}>• List</button>
            <button onClick={() => viewRef.current?.dispatch(viewRef.current.state.tr.setBlockType(0, viewRef.current.state.doc.content.size, mySchema.nodes.ordered_list))} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.5rem' }}>1. List</button>
            <button onClick={() => viewRef.current && undo(viewRef.current.state, viewRef.current.dispatch)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.2rem' }}>Undo</button>
            <button onClick={() => viewRef.current && redo(viewRef.current.state, viewRef.current.dispatch)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '0.2rem', border: '1px solid #d1d5db', background: '#f3f4f6', minWidth: '2.2rem' }}>Redo</button>
          </div>
          <div style={{ borderBottom: '1.5px solid #e5e7eb', marginBottom: '1rem' }} />
          <div style={{ flex: 1, minHeight: '270px', maxHeight: '320px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div 
              ref={editorRef} 
              className="ProseMirror" 
              style={{ 
                flex: 1, 
                minHeight: '220px', 
                maxHeight: '270px', 
                overflowY: 'auto', 
                padding: '1rem', 
                border: '1px solid #e5e7eb', 
                borderRadius: '0.5rem',
                backgroundColor: 'white'
              }} 
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button
              className={`submit-change-btn${!hasContent ? ' disabled' : ''}`}
              onClick={handleSubmitChange}
              disabled={!hasContent}
              title={hasContent ? 'Submit your changes' : 'Add some content to submit'}
              style={{ minWidth: '160px', fontSize: '1.1rem' }}
            >
              Submit
            </button>
          </div>
          {showConfirmation && (
            <div className="submit-confirmation">
              Submitted!
            </div>
          )}
        </div>
        <div className="collab-history-pane" style={{ flex: 1, padding: '1.25rem 1.75rem 1.25rem 1.25rem', background: '#f9fafb', overflowY: 'auto', minWidth: '250px', height: '100%' }}>
          <ChangeHistory changes={changes} />
        </div>
      </div>
    </div>
  );
};

export default CollaborativeEditor; 