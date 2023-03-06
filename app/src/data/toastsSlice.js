import { createSlice } from '@reduxjs/toolkit'

export const toastsSlice = createSlice({
  name: 'toasts',
  initialState: {
    value: [],
  },
  reducers: {
    add: (state, action) => {
      state.value = [...state.value, action.payload]
    },
    remove: (state, action) => {
      state.value = state.value.filter(v => v.id === action.payload)
    },
  },
})

// Action creators are generated for each case reducer function
export const { add, remove } = toastsSlice.actions

export default toastsSlice.reducer