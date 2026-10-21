import { Match } from './controller.js?v=2';
import { mount } from './ui.js?v=2';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
