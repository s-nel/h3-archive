import { createSlice } from '@reduxjs/toolkit'

export const eventsSlice = createSlice({
  name: 'events',
  initialState: {
    value: [],
  },
  reducers: {
    setAll: (state, action) => {
      state.value = action.payload
    },
    set: (state, action) => {
      state.value = state.value.map(e => {
        if (e.event_id === action.payload.event_id) {
          return action.payload
        } else {
          return e
        }
      })
    }
  },
})

// Action creators are generated for each case reducer function
export const { set, setAll } = eventsSlice.actions

export default eventsSlice.reducer