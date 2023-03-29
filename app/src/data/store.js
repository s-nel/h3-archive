import { configureStore } from '@reduxjs/toolkit'
import eventsReducer from './eventsSlice'
import peopleReducer from './peopleSlice'
import toastsReducer from './toastsSlice'
import soundbitesReducer from './soundbitesSlice'
import steamiesReducer from './steamiesSlice'

export default configureStore({
  reducer: {
    events: eventsReducer,
    people: peopleReducer,
    toasts: toastsReducer,
    soundbites: soundbitesReducer,
    steamies: steamiesReducer,
  },
})