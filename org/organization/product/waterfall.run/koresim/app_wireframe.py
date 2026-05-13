"""KoreaSim — 와이어프레임 진입점 (채팅 인터뷰 스타일)

실행:
    .venv/bin/streamlit run app_wireframe.py
"""
import streamlit as st

from src.ui.components import chat_flow, header, results_section, sim_picker
from src.ui.theme import inject_theme

st.set_page_config(
    page_title="KoreaSim — 100만명에게 물어보세요",
    layout="wide",
    initial_sidebar_state="collapsed",
)
inject_theme("wireframe.css")

# session_state 초기화
if "selected_sim" not in st.session_state:
    st.session_state.selected_sim = "creative_testing"
if "show_result" not in st.session_state:
    st.session_state.show_result = False

# ── 1. 헤더 ──
header.render()

# ── 2. 히어로 ──
header.render_hero()

# ── 3. 좌(시뮬 선택) + 우(채팅 인터뷰) ──
left, right = st.columns([1, 3], gap="medium")

with left:
    selected_sim = sim_picker.render()

with right:
    chat_flow.render(selected_sim)

# ── 4. 고급 옵션 (폴드) ──
with st.expander("⚙ 고급 옵션 — 타겟 · 시드 (기본값: 무직 제외, 시드 42)", expanded=False):
    c1, c2, c3 = st.columns(3)
    with c1:
        st.multiselect(
            "광역시도", ["서울", "경기", "부산", "대구", "광주", "인천", "대전", "울산"],
        )
        st.multiselect("학력", ["고등학교", "전문대", "4년제 대학교", "대학원"])
    with c2:
        st.slider("나이 (채팅 답변보다 우선)", 19, 99, (25, 55))
        st.radio("성별", ["전체", "남자", "여자"], horizontal=True)
    with c3:
        st.checkbox("무직 제외", value=True)
        st.number_input("시드", value=42, step=1)

# ── 5. 결과 섹션 ──
if st.session_state.show_result:
    results_section.render(st.session_state.selected_sim)
