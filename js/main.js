import { Match } from './controller.js?v=10';
import { mount } from './ui.js?v=10';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
