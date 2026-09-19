// Order-preserving split of PROJECTS (max-lines); append new projects to entries-part-2.ts.
import type { Project } from './types';
import { IMAGE_ALT, toYouTubeVideoUrl } from './shared';

export const PROJECT_ENTRIES_PART_2: readonly Project[] = [
  {
    id: 'airr',
    title: 'Airr Product Demo',
    setting: 'work',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'private' },
    description:
      'Interactive product demonstration for Airr, an enterprise solution that automates transcript consumption and analysis. Showcases advanced data processing capabilities and intuitive user interface design for complex workflow management.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/airr-product-demo-screenshot.optimized.webp',
      '/airr/1.optimized.webp',
      '/airr/2.optimized.webp',
      '/airr/3.optimized.webp',
      '/airr/4.optimized.webp',
      '/airr/5.optimized.webp',
      '/airr/6.optimized.webp',
    ],
    galleryImageSrc: [
      '/airr-product-demo-screenshot.optimized.webp',
      '/airr/1.optimized.webp',
      '/airr/2.optimized.webp',
      '/airr/3.optimized.webp',
      '/airr/4.optimized.webp',
      '/airr/5.optimized.webp',
      '/airr/6.optimized.webp',
      '/airr/7.optimized.webp',
    ],
    topics: [
      'typescript',
      'nodejs',
      'postgres',
      'react',
      'tailwind',
      'trpc',
      'vercel',
    ],
    resume: { include: false },
  },
  {
    id: 'screenshot-service',
    title: 'Screenshots as a Service',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/screenshot-service' },
    description:
      'Software-as-a-Service platform enabling developers to programmatically generate high-quality screenshots of web pages. Provides reliable, scalable screenshot generation with customizable options. Powers the screenshot generation for this portfolio.',
    imageAlt: IMAGE_ALT,
    imageSrc: [
      '/screenshots-as-a-service-screenshot.optimized.webp',
      '/screenshot-service.optimized.webp',
    ],
    galleryImageSrc: [
      '/screenshots-as-a-service-screenshot.optimized.webp',
      toYouTubeVideoUrl({
        youTubeVideoId: 'lCEzYGJ0rN8',
        autoplay: true,
        mute: true,
      }),
      '/screenshot-service.optimized.webp',
    ],
    topics: [
      'css',
      'heroku',
      'material-ui',
      'nodejs',
      'postgres',
      'puppeteer',
      'react',
      'react-query',
      'typescript',
      'supabase',
    ],
  },
  {
    id: 'orchard',
    title: 'Orchard',
    setting: 'work',
    deployment: { t: 'public', url: 'https://asuorchard.asu.edu/' },
    code: { t: 'private' },
    description:
      "Educational platform developed by ASU that empowers instructors to create highly customizable assignments. Architected and implemented the LTI 1.3 integration with ASU's Learning Management System, enabling seamless single sign-on and grade passback functionality.",
    imageAlt: IMAGE_ALT,
    imageSrc: ['/orchard.optimized.webp'],
    galleryImageSrc: ['/orchard.optimized.webp'],
    topics: ['php', 'mysql', 'drupal', 'bootstrap', 'javascript'],
    resume: { include: false },
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
    id: 'moviefinder-app-react',
    title: 'moviefinder.app (React)',
    setting: 'side',
    deployment: {
      t: 'public',
      url: 'https://moviefinder-app-react.chrisvouga.dev',
    },
    code: {
      t: 'public',
      url: 'https://github.com/crvouga/moviefinder.app-react',
    },
    description:
      'React implementation of the moviefinder.app movie discovery platform.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/moviefinder-app-react-screenshot.optimized.webp'],
    galleryImageSrc: ['/moviefinder-app-react-screenshot.optimized.webp'],
    topics: ['react', 'typescript'],
  },
  {
    id: 'moviefinder-app-clojurescript',
    title: 'moviefinder.app (ClojureScript)',
    setting: 'side',
    deployment: {
      t: 'public',
      url: 'https://moviefinder-app-clojurescript.chrisvouga.dev',
    },
    code: {
      t: 'public',
      url: 'https://github.com/crvouga/moviefinder.app-clojurescript',
    },
    description:
      'ClojureScript implementation of the moviefinder.app movie discovery platform.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/moviefinder-app-clojurescript-screenshot.optimized.webp'],
    galleryImageSrc: [
      '/moviefinder-app-clojurescript-screenshot.optimized.webp',
    ],
    topics: ['clojurescript'],
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
  {
    id: 'moviefinder-app-go',
    title: 'moviefinder.app (Go)',
    setting: 'side',
    deployment: { t: 'not-deployed-anymore' },
    code: { t: 'public', url: 'https://github.com/crvouga/moviefinder.app-go' },
    description:
      'Go implementation of the moviefinder.app movie discovery platform.',
    imageAlt: IMAGE_ALT,
    imageSrc: ['/moviefinder-app-go-screenshot.optimized.webp'],
    galleryImageSrc: ['/moviefinder-app-go-screenshot.optimized.webp'],
    topics: ['go'],
  },
];
