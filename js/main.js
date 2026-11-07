import { Match } from './controller.js?v=5';
import { mount } from './ui.js?v=5';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
