/**
 * Early and small projects: games, toys, and client sites from before the work
 * the homepage leads with.
 *
 * They are kept out of `PROJECTS` so they never dilute the curated listing, the
 * Toolbox stack, the screenshot jobs, or the resume — but they stay in the
 * repository and render behind the "show everything" fold on `/projects/`, so
 * every project ever built is still one page away.
 */
import type { Project } from './types';
import { IMAGE_ALT, toYouTubeVideoUrl } from './shared';

export const PROJECT_ENTRIES_ARCHIVE: readonly Project[] = [
  {
    id: 'todo-app',
    title: 'Fullstack Todo App',
    setting: 'side',
    deployment: { t: 'public', url: 'https://todo.chrisvouga.dev' },
    code: { t: 'public', url: 'https://github.com/crvouga/todo-v1' },
    description:
      'Full-stack task management application with user authentication and real-time synchronization. Demonstrates end-to-end development capabilities from database design to responsive UI implementation.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/fullstack-todo-app-screenshot.optimized.webp',
      '/todo.optimized.webp',
    ],
    galleryImageSrc: [
      '/fullstack-todo-app-screenshot.optimized.webp',
      '/todo.optimized.webp',
    ],
    topics: [
      'typescript',
      'vue',
      'css',
      'express',
      'javascript',
      'tailwind',
      'nodejs',
      'mongodb',
    ],
  },
  {
    id: 'connect-four',
    title: 'Connect Four: AI & Multiplayer',
    setting: 'side',
    deployment: { t: 'public', url: 'https://connectfour.chrisvouga.dev/' },
    code: { t: 'public', url: 'https://github.com/crvouga/connect-four' },
    description:
      'Real-time multiplayer Connect Four game with WebSocket-based synchronization. Features smooth animations, responsive design, and seamless online gameplay for multiple concurrent users.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/connect-four-ai-multiplayer-screenshot.optimized.webp',
      '/connect-four.optimized.webp',
    ],
    galleryImageSrc: [
      '/connect-four-ai-multiplayer-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: '9_TbyftkaQw',
        autoplay: true,
        mute: true,
      }),
      '/connect-four.optimized.webp',
    ],
    topics: [
      'css',
      'greensock',
      'heroku',
      'material-ui',
      'nodejs',
      'ramda',
      'redux',
      'redux-saga',
      'javascript',
      'socket-io',
    ],
  },
  {
    id: 'quiz-maker',
    title: 'LTI compatible quiz maker',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/quiz-maker' },
    description:
      'LTI-compatible quiz creation platform that integrates seamlessly with Learning Management Systems. Enables instructors to build custom quizzes and assessments while providing students with a native LMS experience.',
    imageAlt: IMAGE_ALT,
    imageSrc: [],
    galleryImageSrc: [],
    topics: ['css', 'express', 'nodejs', 'tailwind', 'typescript', 'vue'],
  },
  {
    id: 'courier-website',
    title: 'Courier Company Website',
    setting: 'work',
    deployment: {
      t: 'public',
      url: 'https://gps-couriers-website.vercel.app/',
    },
    code: { t: 'private' },
    description:
      'Professional marketing website for a healthcare courier company, featuring responsive design, optimized performance, and clear communication of services to potential clients.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/courier-company-website-screenshot.optimized.webp',
      '/courier.optimized.webp',
    ],
    galleryImageSrc: [
      '/courier-company-website-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'kFwPTJcM6I0',
        autoplay: true,
        mute: true,
      }),
      '/courier.optimized.webp',
    ],
    topics: ['css', 'material-ui', 'nextjs', 'react', 'typescript'],
    resume: { include: false },
  },
  {
    id: 'anime-blog',
    title: 'Anime Blog',
    setting: 'side',
    deployment: { t: 'public', url: 'https://anime.chrisvouga.dev/' },
    code: { t: 'public', url: 'https://github.com/crvouga/anime' },
    description:
      'Modern JAMstack blog built with Vue and Gridsome, featuring a headless CMS integration for content management. Demonstrates static site generation and performance optimization techniques.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/anime-blog-screenshot.optimized.webp',
      '/anime.optimized.webp',
    ],
    galleryImageSrc: [
      '/anime-blog-screenshot.optimized.webp',
      '/anime.optimized.webp',
    ],
    topics: [
      'css',
      'javascript',
      'sanity',
      'vue',
      'bootstrap',
      'graphql',
      'gridsome',
    ],
  },
  {
    id: 'snake-game',
    title: 'Smooth Snake Game',
    setting: 'side',
    deployment: { t: 'public', url: 'https://snake.chrisvouga.dev/' },
    code: { t: 'public', url: 'https://github.com/crvouga/snake' },
    description:
      'Classic Snake game implemented using functional programming principles, featuring smooth animations and responsive controls. Showcases clean code architecture and modern React patterns.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/smooth-snake-game-screenshot.optimized.webp',
      '/snake.optimized.webp',
    ],
    galleryImageSrc: [
      '/smooth-snake-game-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: '7El3RdkzlHs',
        autoplay: true,
        mute: true,
      }),
      '/snake.optimized.webp',
    ],
    topics: ['css', 'javascript', 'ramda', 'react'],
  },
  {
    id: 'match-three',
    title: 'Match Three',
    setting: 'side',
    deployment: { t: 'public', url: 'https://matchthree.chrisvouga.dev/' },
    code: { t: 'public', url: 'https://github.com/crvouga/match-three' },
    description:
      'Match-three puzzle game inspired by Candy Crush, featuring engaging gameplay mechanics, smooth animations, and responsive design. Demonstrates game development skills and state management expertise.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/match-three-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/match-three-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'VBrlDgmXSoA',
        autoplay: true,
        mute: true,
      }),
    ],
    topics: ['css', 'javascript', 'ramda', 'react', 'redux', 'redux-saga'],
  },
  {
    id: 'simon-says',
    title: 'Simon Says',
    setting: 'side',
    deployment: { t: 'public', url: 'https://simonsays.chrisvouga.dev/' },
    code: { t: 'public', url: 'https://github.com/crvouga/simon-says' },
    description:
      'Interactive implementation of the classic Simon Says memory game, featuring visual and audio feedback, progressive difficulty, and polished user interface design.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/simon-says-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/simon-says-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'WrUFzlKL0E0',
        autoplay: true,
        mute: true,
      }),
    ],
    topics: ['css', 'javascript', 'ramda', 'react', 'redux', 'redux-saga'],
  },
  {
    id: 'cheese',
    title: 'Cheese',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/cheese' },
    description:
      'Web application for generating customizable event identification cards with client-side image manipulation. Explores advanced browser APIs for image processing and demonstrates creative problem-solving in web development.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/cheese.optimized.webp'],
    galleryImageSrc: [
      toYouTubeVideoUrl({
        youTubeVideoId: 'hv3tRBHF7w4',
        autoplay: true,
        mute: true,
      }),
      '/cheese.optimized.webp',
    ],
    topics: ['css', 'typescript', 'material-ui', 'react', 'firebase'],
  },
  {
    id: 'pickflix',
    title: 'Pickflix',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/pickflix-v1' },
    description:
      'Social movie discovery platform enabling users to watch trailers, write reviews, and collaborate on movie lists with friends. Features real-time updates and a comprehensive movie database integration.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/pickflix-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/pickflix-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: '-atthbuMFIM',
        autoplay: true,
        mute: true,
      }),
    ],
    topics: [
      'express',
      'heroku',
      'jest',
      'material-ui',
      'nodejs',
      'postgres',
      'ramda',
      'react',
      'redux',
      'redux-saga',
      'typescript',
      'css',
      'react-query',
    ],
  },
];
