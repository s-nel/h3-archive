import { createSlice } from '@reduxjs/toolkit'

export const peopleSlice = createSlice({
  name: 'people',
  initialState: {
    value: null,
  },
  reducers: {
    setAll: (state, action) => {
      state.value = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { setAll } = peopleSlice.actions

export default peopleSlice.reducer