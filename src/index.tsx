/* @refresh reload */
import { render } from 'solid-js/web'
import 'modern-css-reset/dist/reset.min.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
