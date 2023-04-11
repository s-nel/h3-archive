import { configureStore } from '@reduxjs/toolkit'
import peopleReducer from './peopleSlice'
import toastsReducer from './toastsSlice'
import soundbitesReducer from './soundbitesSlice'
import steamiesReducer from './steamiesSlice'

export default configureStore({
  reducer: {
    people: peopleReducer,
    toasts: toastsReducer,
    soundbites: soundbitesReducer,
    steamies: steamiesReducer,
  },
})