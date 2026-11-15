import { Match } from './controller.js?v=6';
import { mount } from './ui.js?v=6';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
