import { configureStore, createSlice } from '@reduxjs/toolkit';
const slice = createSlice({name:'app', initialState:{result:null, history:[]}, reducers:{
 setResult:(s,a)=>{s.result=a.payload}, setHistory:(s,a)=>{s.history=a.payload}
}});
export const {setResult,setHistory}=slice.actions;
export default configureStore({reducer:{app:slice.reducer}});
