// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as TraceModel from '../../../../../front_end/models/trace/trace.js';
import { C } from '../../../../../front_end/third_party/codemirror.next/chunk/codemirror';

const {assert} = chai;

import {loadEventsFromTraceFile, setTraceModelTimeout} from '../../helpers/TraceHelpers.js';


/*



./parsing-prof.json
./allcats.json
./Profile-20210121T154232.json
./Profile-20200501T114609.json
./example-trace-unbounded-raster.json
./Profile-20230119T113544.json
./oldnav-dt-trace-matches-netexport.json
./Profile-20201117T141907.json
./had-recent-input.cjs-20220901142838.trace.json
./psi-navback.json
./loading-existing-doc-goodtrace.json
./coldish-C.json
./airbnb.json
./lh-report-cpuprof-interrupted.json
./lh-trace-fails-in-rpp.json
./defaultPass-somethign.trace.json
./defaultPass-tw2.trace.json




./Chrome_111_trading_view_Profile-20230308T222839-navstart.json
./psweb-drag-brush.json
./trace_wixfull.json
./npptrace.json.gz
./somecouranttrace.json
./raisedbuttonfalse.json
./lantern-traces/unthrottled-assets/www_t_online_de.trace.json
./lantern-traces/unthrottled-assets/www_globo_com.trace.json
./lantern-traces/unthrottled-assets/www_hatena_ne_jp.trace.json
./lantern-traces/unthrottled-assets/www_cnet_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_rakuten_ne_jp.trace.json
./lantern-traces/unthrottled-assets/www_metrolyrics_com.trace.json
./lantern-traces/unthrottled-assets/www_onet_pl.trace.json
./lantern-traces/unthrottled-assets/www_dion_ne_jp.trace.json
./lantern-traces/unthrottled-assets/www_rakuten_co_jp.trace.json
./lantern-traces/unthrottled-assets/www_hotfile_com.trace.json
./lantern-traces/unthrottled-assets/www_liveperson_net.trace.json
./lantern-traces/unthrottled-assets/www_orange_fr.trace.json
./lantern-traces/unthrottled-assets/www_mail_ru.trace.json
./lantern-traces/unthrottled-assets/www_tianya_cn.trace.json
./lantern-traces/unthrottled-assets/www_dawn_com.trace.json
./lantern-traces/unthrottled-assets/www_brothersoft_com.trace.json
./lantern-traces/unthrottled-assets/www_4399_com.trace.json
./lantern-traces/unthrottled-assets/www_softonic_com.trace.json
./lantern-traces/unthrottled-assets/www_hp_com.trace.json
./lantern-traces/unthrottled-assets/www_att_com.trace.json
./lantern-traces/unthrottled-assets/www_metrolyrics_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_hulu_com.trace.json
./lantern-traces/unthrottled-assets/www_thestar_com_my.trace.json
./lantern-traces/unthrottled-assets/www_huffingtonpost_com.trace.json
./lantern-traces/unthrottled-assets/www_nokia_com.trace.json
./lantern-traces/unthrottled-assets/www_msn_com.trace.json
./lantern-traces/unthrottled-assets/www_foxnews_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_foxnews_com.trace.json
./lantern-traces/unthrottled-assets/www_zol_com_cn.trace.json
./lantern-traces/unthrottled-assets/www_thefreedictionary_com.trace.json
./lantern-traces/unthrottled-assets/www_56_com.trace.json
./lantern-traces/unthrottled-assets/www_livedoor_jp.trace.json
./lantern-traces/unthrottled-assets/www_weather_com.trace.json
./lantern-traces/unthrottled-assets/www_espn_com.trace.json
./lantern-traces/unthrottled-assets/www_metacafe_com.trace.json
./lantern-traces/unthrottled-assets/www_mop_com.trace.json
./lantern-traces/unthrottled-assets/weather_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_vevo_com.trace.json
./lantern-traces/unthrottled-assets/www_deviantart_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_partypoker_com.trace.json
./lantern-traces/unthrottled-assets/www_cnet_com.trace.json
./lantern-traces/unthrottled-assets/www_filestube_com.trace.json
./lantern-traces/unthrottled-assets/www_addthis_com.trace.json
./lantern-traces/unthrottled-assets/www_pptv_com.trace.json
./lantern-traces/unthrottled-assets/www_weather_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_deviantart_com.trace.json
./lantern-traces/unthrottled-assets/www_china_com_cn.trace.json
./lantern-traces/unthrottled-assets/weather_com.trace.json
./lantern-traces/unthrottled-assets/www_verizonwireless_com.trace.json
./lantern-traces/unthrottled-assets/www_mlb_com.devtoolslog.json
./lantern-traces/unthrottled-assets/www_mlb_com.trace.json
./lantern-traces/unthrottled-assets/www_tabelog_com.trace.json
./paulirish-load-layoutshifts.json
./bestbuy-tapnav-desktop.json
./ilweb-load-and-itwasquick.json
./coldish-load-netlog.json
./npptrace.gz
./defaultPass-tw.trace.json
./someairbnbHIL.trace.json
./clsartifacts/00009/defaultPass.trace.json
./clsartifacts/00007/defaultPass.trace.json
./clsartifacts/00006/defaultPass.trace.json
./clsartifacts/00008/defaultPass.trace.json
./clsartifacts/024/defaultPass.trace.json
./clsartifacts/023/defaultPass.trace.json
./clsartifacts/015/defaultPass.trace.json
./clsartifacts/012/defaultPass.trace.json
./clsartifacts/079/defaultPass.trace.json
./clsartifacts/0003/defaultPass.trace.json
./clsartifacts/046/defaultPass.trace.json
./clsartifacts/0004/defaultPass.trace.json
./clsartifacts/041/defaultPass.trace.json
./clsartifacts/048/defaultPass.trace.json
./clsartifacts/077/defaultPass.trace.json
./clsartifacts/084/defaultPass.trace.json
./clsartifacts/070/defaultPass.trace.json
./clsartifacts/013/defaultPass.trace.json
./clsartifacts/014/defaultPass.trace.json
./clsartifacts/022/defaultPass.trace.json
./clsartifacts/025/defaultPass.trace.json
./clsartifacts/071/defaultPass.trace.json
./clsartifacts/082/defaultPass.trace.json
./clsartifacts/076/defaultPass.trace.json
./clsartifacts/0005/defaultPass.trace.json
./clsartifacts/040/defaultPass.trace.json
./clsartifacts/078/defaultPass.trace.json
./clsartifacts/0002/defaultPass.trace.json
./clsartifacts/047/defaultPass.trace.json
./clsartifacts/065/defaultPass.trace.json
./clsartifacts/091/defaultPass.trace.json
./clsartifacts/0020/defaultPass.trace.json
./clsartifacts/0018/defaultPass.trace.json
./clsartifacts/062/defaultPass.trace.json
./clsartifacts/054/defaultPass.trace.json
./clsartifacts/0011/defaultPass.trace.json
./clsartifacts/053/defaultPass.trace.json
./clsartifacts/0016/defaultPass.trace.json
./clsartifacts/038/defaultPass.trace.json
./clsartifacts/007/defaultPass.trace.json
./clsartifacts/009/defaultPass.trace.json
./clsartifacts/036/defaultPass.trace.json
./clsartifacts/031/defaultPass.trace.json
./clsartifacts/052/defaultPass.trace.json
./clsartifacts/0017/defaultPass.trace.json
./clsartifacts/055/defaultPass.trace.json
./clsartifacts/0010/defaultPass.trace.json
./clsartifacts/0019/defaultPass.trace.json
./clsartifacts/063/defaultPass.trace.json
./clsartifacts/090/defaultPass.trace.json
./clsartifacts/064/defaultPass.trace.json
./clsartifacts/0021/defaultPass.trace.json
./clsartifacts/030/defaultPass.trace.json
./clsartifacts/008/defaultPass.trace.json
./clsartifacts/037/defaultPass.trace.json
./clsartifacts/001/defaultPass.trace.json
./clsartifacts/039/defaultPass.trace.json
./clsartifacts/006/defaultPass.trace.json
./clsartifacts/00004/defaultPass.trace.json
./clsartifacts/00003/defaultPass.trace.json
./clsartifacts/00002/defaultPass.trace.json
./clsartifacts/00005/defaultPass.trace.json
./clsartifacts/0007/defaultPass.trace.json
./clsartifacts/089/defaultPass.trace.json
./clsartifacts/042/defaultPass.trace.json
./clsartifacts/0000/defaultPass.trace.json
./clsartifacts/045/defaultPass.trace.json
./clsartifacts/087/defaultPass.trace.json
./clsartifacts/073/defaultPass.trace.json
./clsartifacts/0009/defaultPass.trace.json
./clsartifacts/074/defaultPass.trace.json
./clsartifacts/080/defaultPass.trace.json
./clsartifacts/020/defaultPass.trace.json
./clsartifacts/027/defaultPass.trace.json
./clsartifacts/018/defaultPass.trace.json
./clsartifacts/011/defaultPass.trace.json
./clsartifacts/016/defaultPass.trace.json
./clsartifacts/029/defaultPass.trace.json
./clsartifacts/081/defaultPass.trace.json
./clsartifacts/075/defaultPass.trace.json
./clsartifacts/072/defaultPass.trace.json
./clsartifacts/0008/defaultPass.trace.json
./clsartifacts/086/defaultPass.trace.json
./clsartifacts/0001/defaultPass.trace.json
./clsartifacts/044/defaultPass.trace.json
./clsartifacts/088/defaultPass.trace.json
./clsartifacts/0006/defaultPass.trace.json
./clsartifacts/043/defaultPass.trace.json
./clsartifacts/017/defaultPass.trace.json
./clsartifacts/028/defaultPass.trace.json
./clsartifacts/010/defaultPass.trace.json
./clsartifacts/026/defaultPass.trace.json
./clsartifacts/019/defaultPass.trace.json
./clsartifacts/021/defaultPass.trace.json
./clsartifacts/003/defaultPass.trace.json
./clsartifacts/004/defaultPass.trace.json
./clsartifacts/032/defaultPass.trace.json
./clsartifacts/035/defaultPass.trace.json
./clsartifacts/061/defaultPass.trace.json
./clsartifacts/0024/defaultPass.trace.json
./clsartifacts/066/defaultPass.trace.json
./clsartifacts/0023/defaultPass.trace.json
./clsartifacts/059/defaultPass.trace.json
./clsartifacts/050/defaultPass.trace.json
./clsartifacts/0015/defaultPass.trace.json
./clsartifacts/057/defaultPass.trace.json
./clsartifacts/0012/defaultPass.trace.json
./clsartifacts/068/defaultPass.trace.json
./clsartifacts/034/defaultPass.trace.json
./clsartifacts/033/defaultPass.trace.json
./clsartifacts/005/defaultPass.trace.json
./clsartifacts/002/defaultPass.trace.json
./clsartifacts/056/defaultPass.trace.json
./clsartifacts/0013/defaultPass.trace.json
./clsartifacts/069/defaultPass.trace.json
./clsartifacts/051/defaultPass.trace.json
./clsartifacts/0014/defaultPass.trace.json
./clsartifacts/067/defaultPass.trace.json
./clsartifacts/0022/defaultPass.trace.json
./clsartifacts/058/defaultPass.trace.json
./clsartifacts/060/defaultPass.trace.json
./clsartifacts/0025/defaultPass.trace.json
./buttonfalse.json
./Profile-20220714T160340.json.gz
./janstta-profile-report-2.json
./chrome-net-export-log.json
./paintprofiler-and-layers.json
./tracex_coldish.json
./Pantheon-network-whiskers.json
./smallishtrace-with-js-sampleproblem.json.sorted.json
./tracecafe-stored-traces/traces/UIMSJ278w9
./tracecafe-stored-traces/traces/t0whcLiZsL
./tracecafe-stored-traces/traces/392RlSkvEn
./tracecafe-stored-traces/traces/aLOdPbfop1
./tracecafe-stored-traces/traces/fSyv2RUHyy
./tracecafe-stored-traces/traces/1eSFqIPbFR
./tracecafe-stored-traces/traces/BVitLnh3wh
./tracecafe-stored-traces/traces/aBXYJOn2WK
./tracecafe-stored-traces/traces/yWdmByAM1Q
./tracecafe-stored-traces/traces/mhTcOmbfZC

./Profile-20230202T180210-rcs.json
./tracecafe-stored-traces/traces/ObwBJ2OdiH
./tracecafe-stored-traces/traces/WvzhaRGXdc
./tracecafe-stored-traces/traces/uRYwl4LmL3
./tracecafe-stored-traces/traces/fAxof2b6bg
./tracecafe-stored-traces/traces/AlO8HOx6NE
./tracecafe-stored-traces/traces/CBgxfj5ztF
./tracecafe-stored-traces/traces/I8Dl0W4dF6
./tracecafe-stored-traces/traces/aVWyuf9PtD
./tracecafe-stored-traces/traces/HCFf0fefng
./tracecafe-stored-traces/traces/0omRCPd8OX
./tracecafe-stored-traces/traces/ghAXmOs106
./tracecafe-stored-traces/traces/ydfp5qinLq
./tracecafe-stored-traces/traces/wChek71ZUW
./tracecafe-stored-traces/traces/RF0GrBptHA
./tracecafe-stored-traces/traces/M17SM7emwy
./tracecafe-stored-traces/traces/y2bdByUmGD
./tracecafe-stored-traces/traces/ENSYodUwcR
./tracecafe-stored-traces/traces/ydhHRWCvfT
./tracecafe-stored-traces/traces/4ssaiH9XtL
./tracecafe-stored-traces/traces/eUomkA12ys
./tracecafe-stored-traces/traces/tt2YxtJzuP
./tracecafe-stored-traces/traces/yS1dB5PvJN
./tracecafe-stored-traces/traces/Y23uQymmvx
./tracecafe-stored-traces/traces/ok.json
./tracecafe-stored-traces/traces/uTXaoxxtAg
./tracecafe-stored-traces/traces/orBrE94gex
./tracecafe-stored-traces/traces/NrHfIJx03M
./tracecafe-stored-traces/traces/VjFiKFqxZ8
./tracecafe-stored-traces/traces/TmhGeDHvYO
./tracecafe-stored-traces/traces/sXlHo572lX
./tracecafe-stored-traces/traces/38ThkrmhBo
./tracecafe-stored-traces/traces/ecgZJjKgTG
./tracecafe-stored-traces/traces/dKK5eUJrm9
./tracecafe-stored-traces/traces/K5Uw6FD5GT
./tracecafe-stored-traces/traces/aK6iVRHgcq
./tracecafe-stored-traces/traces/xS8O6sTSg1
./tracecafe-stored-traces/traces/2aRQUK3PTZ
./tracecafe-stored-traces/traces/71Tn6TaET1
./tracecafe-stored-traces/traces/KdXpLjvJ9R
./tracecafe-stored-traces/traces/408ZudHQ5V
./tracecafe-stored-traces/traces/MvI9tqH0ZY
./tracecafe-stored-traces/traces/Mrko6ECrzY
./tracecafe-stored-traces/traces/Zc3R6itQRk
./tracecafe-stored-traces/traces/rEpSytXwuM
./tracecafe-stored-traces/traces/VUos4Gp1aK
./tracecafe-stored-traces/traces/6AwHfh1LFd
./tracecafe-stored-traces/traces/mwh5iTYpTG
./tracecafe-stored-traces/traces/dxruCqCqvw
./tracecafe-stored-traces/traces/us8t4EmGdn
./tracecafe-stored-traces/traces/xUvEGcfuDc
./tracecafe-stored-traces/traces/25VPYMmaFT



./tracecafe-stored-traces/traces/bpEmwBXyfj
./tracecafe-stored-traces/traces/0Ay54ZgNbV
./tracecafe-stored-traces/traces/f6RarqF2pt
./tracecafe-stored-traces/traces/rwqZxHzBLP
./tracecafe-stored-traces/traces/N0JihqBcI6
./tracecafe-stored-traces/traces/l1cZGxnrk4
./tracecafe-stored-traces/traces/sci5w0nUs0
./tracecafe-stored-traces/traces/cOiFOGBylj
./tracecafe-stored-traces/traces/3nsWqRcYyX
./tracecafe-stored-traces/traces/kkAzioxxgq
./tracecafe-stored-traces/traces/NWsxmtW4G7
./tracecafe-stored-traces/traces/XAB4uaRmNm
./tracecafe-stored-traces/traces/mZUnUjmiW8
./tracecafe-stored-traces/traces/Du9kJhH6ED
./tracecafe-stored-traces/traces/v8iYj1S1Er
./tracecafe-stored-traces/traces/mJZdWZsrke
./tracecafe-stored-traces/traces/smallest-trace.json
./tracecafe-stored-traces/traces/7ZBM0YeDiU
./tracecafe-stored-traces/traces/GclwB3EZEO
./tracecafe-stored-traces/traces/7pTOoAer8u
./tracecafe-stored-traces/traces/3yVdFuXhd1
./tracecafe-stored-traces/traces/ABlB29o1Im
./tracecafe-stored-traces/traces/j2dvM529gl
./tracecafe-stored-traces/traces/gBrpqWHjBS
./tracecafe-stored-traces/traces/1y14SvSGzv
./tracecafe-stored-traces/traces/YWbIwmweqs
./tracecafe-stored-traces/traces/FSJUbJBrWr
./tracecafe-stored-traces/traces/SibRteyP5T
./tracecafe-stored-traces/traces/MIdstyKD0c
./tracecafe-stored-traces/traces/7NCQNVaE92
./tracecafe-stored-traces/traces/wXQhRCb4sZ
./tracecafe-stored-traces/traces/I3c59wfMa9
./tracecafe-stored-traces/traces/1JZHsuXljb
./tracecafe-stored-traces/traces/JvKT10OjJO
./tracecafe-stored-traces/traces/aNErDEVsVP



./tracecafe-stored-traces/traces/dB8GdmkkHW
./tracecafe-stored-traces/traces/x6jHhlJ23U
./tracecafe-stored-traces/traces/duN7zjaX2f
./tracecafe-stored-traces/traces/p2t2y2gmiV
./tracecafe-stored-traces/traces/qgtpHZ2zyj
./tracecafe-stored-traces/traces/VM10XjILsS
./tracecafe-stored-traces/traces/332e70Z3f8
./tracecafe-stored-traces/traces/rYzwz4JV4T
./tracecafe-stored-traces/traces/7JyT2xIR0M
./tracecafe-stored-traces/traces/J7uMuKX35Z
./tracecafe-stored-traces/traces/E2cHDrmrqK
./tracecafe-stored-traces/traces/8skDk5IyZj
./tracecafe-stored-traces/traces/7hpcTIGzVR
./tracecafe-stored-traces/traces/mMojrrK1Pc
./tracecafe-stored-traces/traces/EVMZkOyVjJ
./tracecafe-stored-traces/traces/0Ml0M9d8jJ
./tracecafe-stored-traces/traces/sJoX2ZE2K2
./tracecafe-stored-traces/traces/L7s2jfz5Ie
./tracecafe-stored-traces/traces/vPMMSE7g2g
./tracecafe-stored-traces/traces/iKNgmEzMvH
./tracecafe-stored-traces/traces/2s04X54GTZ
./tracecafe-stored-traces/traces/tlNOlI7xGj
./tracecafe-stored-traces/traces/ZRJKZ6iXln
./tracecafe-stored-traces/traces/KitfXliwBo
./tracecafe-stored-traces/traces/N3t3HPqek8
./tracecafe-stored-traces/traces/iTgLBOgCNT
./tracecafe-stored-traces/traces/XOzx7RgfOZ
./tracecafe-stored-traces/traces/zfrzECyeUr
./tracecafe-stored-traces/traces/GWkgxdYlZp
./tracecafe-stored-traces/traces/XE7LvLl6YO
./tracecafe-stored-traces/traces/AONaKXvHYa
./tracecafe-stored-traces/traces/NZ82lqFyvv
./tracecafe-stored-traces/traces/bVAchBiFyo
./tracecafe-stored-traces/traces/mAAHkfYFWF
./tracecafe-stored-traces/traces/KDY70t1SCW



./tracecafe-stored-traces/traces/9YenQg306O
./tracecafe-stored-traces/traces/NWc7LlEgLd
./tracecafe-stored-traces/traces/yTA1LI2kBQ
./tracecafe-stored-traces/traces/J5cggkCTIQ
./tracecafe-stored-traces/traces/74VQwEZvv3
./tracecafe-stored-traces/traces/amnuahohSP
./tracecafe-stored-traces/traces/FLt1dgi9PW
./tracecafe-stored-traces/traces/jEKdTu6MJH
./tracecafe-stored-traces/traces/ACculpxRpp
./tracecafe-stored-traces/traces/MnMNkFxv7o
./tracecafe-stored-traces/traces/komKwCPCD4
./tracecafe-stored-traces/traces/Jaa2HMBUJc
./tracecafe-stored-traces/traces/mmfXL20EyI
./tracecafe-stored-traces/traces/ZZu0g1oPlt
./tracecafe-stored-traces/traces/9SyL6YC4si
./tracecafe-stored-traces/traces/JB99k3QlLo
./tracecafe-stored-traces/traces/nUeWuSlYAh
./tracecafe-stored-traces/traces/blKPjjgO9Z
./tracecafe-stored-traces/traces/57jwA1Zp8F
./tracecafe-stored-traces/traces/idYgJppdE2
./tracecafe-stored-traces/traces/VUBc6FFq8u
./tracecafe-stored-traces/traces/w2bRe8GJoh
./tracecafe-stored-traces/traces/ZR9neOoOvc
./tracecafe-stored-traces/traces/iyKo9XyEFH
./tracecafe-stored-traces/traces/udAQvhLjAY
./tracecafe-stored-traces/traces/64ehFg5HIr
./tracecafe-stored-traces/traces/1jUw8Hyz4v
./tracecafe-stored-traces/traces/7PaCcqC7w7
./tracecafe-stored-traces/traces/JyX9hhZlWT
./tracecafe-stored-traces/traces/py4l6ZEmKJ
./tracecafe-stored-traces/traces/ob5DDldD04
./tracecafe-stored-traces/traces/GGhGWM3ih8
./tracecafe-stored-traces/traces/g3fi2VN7LY
./tracecafe-stored-traces/traces/HLmQDdT9RO
./tracecafe-stored-traces/traces/3AG6DFvZXI
./tracecafe-stored-traces/traces/mFYegZmMTB
./tracecafe-stored-traces/traces/VKBnMWwHIM
./tracecafe-stored-traces/traces/lMOi4NA2mf
./tracecafe-stored-traces/traces/rhnBzoGAEe
./tracecafe-stored-traces/traces/N1EY05D0Xn
./tracecafe-stored-traces/traces/QmqQ7Q5QMX
./tracecafe-stored-traces/traces/Jiwu8XbSlp
./tracecafe-stored-traces/traces/YscgdkxoY8
./tracecafe-stored-traces/traces/8PIo8nv8zq
./tracecafe-stored-traces/traces/mTgNuPb7oA
./tracecafe-stored-traces/traces/7zM2CShIvu
./tracecafe-stored-traces/traces/G2SBxLki6T
./tracecafe-stored-traces/traces/nTRfrwprtl
./tracecafe-stored-traces/traces/PBOCPCjQFF
./tracecafe-stored-traces/traces/OqREoNRepH
./tracecafe-stored-traces/traces/H8U1FW8Eam
./tracecafe-stored-traces/traces/uGqQiDP45L
./tracecafe-stored-traces/traces/9TuO6zyo74
./tracecafe-stored-traces/traces/z3XdfLBZQO
./tracecafe-stored-traces/traces/NfqXuwPhXK
./tracecafe-stored-traces/traces/amoh9mlCRs
./tracecafe-stored-traces/traces/dB2iaQRTWg


./tracecafe-stored-traces/traces/nDyw811vWp
./tracecafe-stored-traces/traces/EcySSHRqE4
./tracecafe-stored-traces/traces/OxCmCxJGbw
./tracecafe-stored-traces/traces/CqRRtDAkVk
./tracecafe-stored-traces/traces/MuOtRolYJ8
./tracecafe-stored-traces/traces/aijkBPrOXo
./tracecafe-stored-traces/traces/CHKJrrv3Gg
./tracecafe-stored-traces/traces/bHctDE8GiW
./tracecafe-stored-traces/traces/DhdD0niJEx
./tracecafe-stored-traces/traces/caE0KLAmTA
./tracecafe-stored-traces/traces/Rz4rQLjyHp
./tracecafe-stored-traces/traces/qTYuzHdeuL
./tracecafe-stored-traces/traces/0C0UKjqRM5
./tracecafe-stored-traces/traces/IhLgmaPD64
./tracecafe-stored-traces/traces/HnJjwvV8J6
./tracecafe-stored-traces/traces/HyCnJvGAdW
./tracecafe-stored-traces/traces/oxmtzlzmXu
./tracecafe-stored-traces/traces/UB361wSer1
./tracecafe-stored-traces/traces/3qksXnsNoT
./tracecafe-stored-traces/traces/CW3FNMiKxb
./tracecafe-stored-traces/traces/Ab4ChXGFNx
./tracecafe-stored-traces/traces/yIlba2F7nt
./tracecafe-stored-traces/traces/vFe0cVS8sH
./tracecafe-stored-traces/traces/XaSDqA9dS7
./tracecafe-stored-traces/traces/gSSg4jN5KM
./tracecafe-stored-traces/traces/4jvDbossga
./tracecafe-stored-traces/traces/ORW0U0pRV1
./tracecafe-stored-traces/traces/hoPPGvOqOb
./tracecafe-stored-traces/traces/BkW6z9fWYD
./tracecafe-stored-traces/traces/DJOaWfACm1
./tracecafe-stored-traces/traces/cfzvZLmvim
./tracecafe-stored-traces/traces/9QbF4xRCrS
./tracecafe-stored-traces/traces/MhytXL8xDf
./tracecafe-stored-traces/traces/ty6eGEAMmN
./tracecafe-stored-traces/traces/9UBuQ081FY
./tracecafe-stored-traces/traces/lrH5trFTWh
./tracecafe-stored-traces/traces/0cwwlXaHOl
./tracecafe-stored-traces/traces/EUYeUTpOgB
./tracecafe-stored-traces/traces/k4Mm47pUbQ
./tracecafe-stored-traces/traces/gxonNi4NJk
./tracecafe-stored-traces/traces/R72LXHSoZh
./tracecafe-stored-traces/traces/lOYp7YUuzj
./tracecafe-stored-traces/traces/6YTJrXLnXS
./tracecafe-stored-traces/traces/BmhhIGtNBb
./tracecafe-stored-traces/traces/gWhf8rl75C


./tracecafe-stored-traces/traces/h6dPEEUQOy
./tracecafe-stored-traces/traces/H6ZhZpK3La
./tracecafe-stored-traces/traces/1JD4Jp0nyq
./tracecafe-stored-traces/traces/4k2CJmsj6s
./tracecafe-stored-traces/traces/oJhy8uh5P9
./tracecafe-stored-traces/traces/Zk7Kpihtex
./tracecafe-stored-traces/traces/F0A83WejiD
./tracecafe-stored-traces/traces/ozx4tWPaQn
./tracecafe-stored-traces/traces/6VYNiwATIN
./tracecafe-stored-traces/traces/1JWQ66CboW
./tracecafe-stored-traces/traces/PHqELV9ltj
./tracecafe-stored-traces/traces/NgWJz0HXmX
./tracecafe-stored-traces/traces/xvx93r3edY
./tracecafe-stored-traces/traces/x8sJZ1Jl3G
./tracecafe-stored-traces/traces/8Tsy8wukXv
./tracecafe-stored-traces/traces/DrNZWLyVW9
./tracecafe-stored-traces/traces/yHGbrxXV8C
./tracecafe-stored-traces/traces/v9hvk3OQ2W
./tracecafe-stored-traces/traces/9rjybfyQqB
./tracecafe-stored-traces/traces/lCfbZFICKT
./tracecafe-stored-traces/traces/9psGTIFyVr
./tracecafe-stored-traces/traces/wVPdVFHxUI
./tracecafe-stored-traces/traces/geAoWjx9M8
./tracecafe-stored-traces/traces/n4H63JhG3g
./tracecafe-stored-traces/traces/gePfXQscZ2
./tracecafe-stored-traces/traces/n9RDopu6ps
./tracecafe-stored-traces/traces/ltm6iAZlF4
./tracecafe-stored-traces/traces/3dmetrVHx1
./tracecafe-stored-traces/traces/kpWHm69iCr
./tracecafe-stored-traces/traces/Rd8274lf8y
./tracecafe-stored-traces/traces/a6VsKsegTF
./tracecafe-stored-traces/traces/32Eigmj63I
./tracecafe-stored-traces/traces/HF9ZAJTiMf
./tracecafe-stored-traces/traces/CE9kA7imJn
./tracecafe-stored-traces/traces/4V4Qn4PD6S
./tracecafe-stored-traces/traces/WU5OxS4GOR
./tracecafe-stored-traces/traces/Z5tyfXY4DI
./tracecafe-stored-traces/traces/Ppz2tzFPn5
./tracecafe-stored-traces/traces/fVNZDVfvbu
./tracecafe-stored-traces/traces/V939PFRiMT
./tracecafe-stored-traces/traces/u3KxUDXlCE
./tracecafe-stored-traces/traces/eU2xIUD6P2
./tracecafe-stored-traces/traces/TdsxKACAAZ
./tracecafe-stored-traces/traces/JamIVwvGIs
./tracecafe-stored-traces/traces/wyHtdXMYSL
./tracecafe-stored-traces/traces/V0dQSr6sZw
./tracecafe-stored-traces/traces/tsgeoenOTi
./tracecafe-stored-traces/traces/9xdDoaezZw
./tracecafe-stored-traces/traces/me6yvqKlCU
./tracecafe-stored-traces/traces/PoFr6JfqlJ


./tracecafe-stored-traces/traces/eM5MY4jpZM
./tracecafe-stored-traces/traces/UIIB9dXYIS
./tracecafe-stored-traces/traces/rVvqhuc373
./tracecafe-stored-traces/traces/jGdTRKlCkS
./tracecafe-stored-traces/traces/qrSZ8I4irp
./tracecafe-stored-traces/traces/h2LePRjkAc
./tracecafe-stored-traces/traces/ey49tl7UTX
./tracecafe-stored-traces/traces/MhvdUTMIn7
./tracecafe-stored-traces/traces/KJJUyWmjfO
./tracecafe-stored-traces/traces/XaEgh4xY5i
./tracecafe-stored-traces/traces/17c9TjUOiP
./tracecafe-stored-traces/traces/gn5tEP4B2L
./tracecafe-stored-traces/traces/h3VnbAvdMG
./tracecafe-stored-traces/traces/4QKbdXq1mP
./tracecafe-stored-traces/traces/TvEqbVxhV2
./tracecafe-stored-traces/traces/X58Sh3gabM
./tracecafe-stored-traces/traces/Ty7Y9FvB06
./tracecafe-stored-traces/traces/0DM50iHNOz
./tracecafe-stored-traces/traces/5QX8I60Jlb
./tracecafe-stored-traces/traces/9BZFlilS33
./tracecafe-stored-traces/traces/Belvcr9rQJ
./tracecafe-stored-traces/traces/0byN2zLt3Q
./tracecafe-stored-traces/traces/qKSerQIs31
./tracecafe-stored-traces/traces/Sto8cVwnSO
./tracecafe-stored-traces/traces/r4bxX0fQ7T
./tracecafe-stored-traces/traces/IKefXkgt3D
./tracecafe-stored-traces/traces/P3mc9UqsFj
./tracecafe-stored-traces/traces/ZDnFwFSELH
./tracecafe-stored-traces/traces/f1Ol3EGwZe
./tracecafe-stored-traces/traces/Dpk4nTA49x
./tracecafe-stored-traces/traces/4AJLZecMLy
./tracecafe-stored-traces/traces/5Lje3PwC7h
./tracecafe-stored-traces/traces/psKGyGKYrM
./tracecafe-stored-traces/traces/BkU3f6KoRW
./tracecafe-stored-traces/traces/ZPaTOrxTWS
./tracecafe-stored-traces/traces/QhPEhyQmWr
./tracecafe-stored-traces/traces/NJNlYzoROc
./tracecafe-stored-traces/traces/G7aLJmJunJ
./tracecafe-stored-traces/traces/blByOn28OJ
./tracecafe-stored-traces/traces/D4cKZyQ7jS
./tracecafe-stored-traces/traces/AWJ1fl42PT
./tracecafe-stored-traces/traces/Zwwo3t9rlR
./tracecafe-stored-traces/traces/lZ4p1Ps7J5
./tracecafe-stored-traces/traces/n6yFVBSpoV
./tracecafe-stored-traces/traces/3MohO2AQ2D
./tracecafe-stored-traces/traces/LBrofU7EJ4
./tracecafe-stored-traces/traces/MTaB4hCsiz



./tracecafe-stored-traces/traces/qKQwpkNklf
./tracecafe-stored-traces/traces/imOfP4YM3g
./tracecafe-stored-traces/traces/bHxL8BP2ZP
./tracecafe-stored-traces/traces/sjkcvCScXc
./tracecafe-stored-traces/traces/s1nSq3BlcP
./tracecafe-stored-traces/traces/wD4MhwC993
./tracecafe-stored-traces/traces/kMPM8I6Nhs
./tracecafe-stored-traces/traces/ufglPW27xX
./tracecafe-stored-traces/traces/sodfQn6Z7I
./tracecafe-stored-traces/traces/4oSIMM6mQY
./tracecafe-stored-traces/traces/JGpV778GJ4
./tracecafe-stored-traces/traces/uWkoFVNfZe
./tracecafe-stored-traces/traces/rRlVUOjJqa
./tracecafe-stored-traces/traces/MMkNRyHYL9
./tracecafe-stored-traces/traces/vDKZvDMjYL
./tracecafe-stored-traces/traces/NItrXcePlM
./tracecafe-stored-traces/traces/6CDPR73rta
./tracecafe-stored-traces/traces/XkP48jyknc
./tracecafe-stored-traces/traces/Bscz1vhjYO
./max-call-stack-repro--orrr-i-cant-reprowithitanymore-bummer.json
./lhtrace.json
./trace_exerkamp-alldisabledcats.json.gz
./Profile-20220815T173718.json
./arizona-to-verge.json
./Profile-20210208T164520.json
./opp-loading-a-gzip-trace.json
./oldnavy-dt-but-star.json
./courant.json
./lol.json
./bad-js-sample-flamecharting.trace.json
./loadingtrace-in-npp.json



./devtools-perf-panel-struggling.json
./Profile-20221116T170544.json
./Profile-20221021T150353.json
./Profile-20210613T123134.json
./small.json
./examplecom-dt-plusstar copy.json
./psweb-coldload-justload.json
./Profile-20220426T193059.json
./chromestatus-trace.json
./paulirish-withstarttimezmaybe.json
./Profile-20220713T110041.json.gz
./exampletrace.json
./arizona-framedestroyed2.json
./newriver-w-netlog.json
./npr-sched-longtasks-cat.json
./lantern-data/https---www-wikipedia-org--mobile-unthrottled-5-trace.json
./lantern-data/https---www-56-com--mobile-unthrottled-9-trace.json
./lantern-data/https---www-ebay-com--mobile-unthrottled-8-trace.json
./lantern-data/https---www-foxnews-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-onet-pl--mobile-unthrottled-3-trace.json
./lantern-data/unthrottled-assets/www_t_online_de.trace.json
./lantern-data/unthrottled-assets/www_globo_com.trace.json
./lantern-data/unthrottled-assets/www_hatena_ne_jp.trace.json
./lantern-data/unthrottled-assets/www_rakuten_ne_jp.trace.json
./lantern-data/unthrottled-assets/www_metrolyrics_com.trace.json
./lantern-data/unthrottled-assets/www_onet_pl.trace.json
./lantern-data/unthrottled-assets/www_dion_ne_jp.trace.json
./lantern-data/unthrottled-assets/www_rakuten_co_jp.trace.json
./lantern-data/unthrottled-assets/www_hotfile_com.trace.json
./lantern-data/unthrottled-assets/www_liveperson_net.trace.json
./lantern-data/unthrottled-assets/www_orange_fr.trace.json
./lantern-data/unthrottled-assets/www_mail_ru.trace.json
./lantern-data/unthrottled-assets/www_tianya_cn.trace.json
./lantern-data/unthrottled-assets/www_dawn_com.trace.json
./lantern-data/unthrottled-assets/www_brothersoft_com.trace.json
./lantern-data/unthrottled-assets/www_4399_com.trace.json
./lantern-data/unthrottled-assets/www_softonic_com.trace.json
./lantern-data/unthrottled-assets/www_hp_com.trace.json
./lantern-data/unthrottled-assets/www_att_com.trace.json
./lantern-data/unthrottled-assets/www_hulu_com.trace.json
./lantern-data/unthrottled-assets/www_thestar_com_my.trace.json
./lantern-data/unthrottled-assets/www_huffingtonpost_com.trace.json
./lantern-data/unthrottled-assets/www_nokia_com.trace.json
./lantern-data/unthrottled-assets/www_msn_com.trace.json
./lantern-data/unthrottled-assets/www_foxnews_com.trace.json
./lantern-data/unthrottled-assets/www_zol_com_cn.trace.json
./lantern-data/unthrottled-assets/www_thefreedictionary_com.trace.json
./lantern-data/unthrottled-assets/www_56_com.trace.json
./lantern-data/unthrottled-assets/www_livedoor_jp.trace.json
./lantern-data/unthrottled-assets/www_weather_com.trace.json
./lantern-data/unthrottled-assets/www_espn_com.trace.json
./lantern-data/unthrottled-assets/www_metacafe_com.trace.json
./lantern-data/unthrottled-assets/www_mop_com.trace.json
./lantern-data/unthrottled-assets/www_vevo_com.trace.json
./lantern-data/unthrottled-assets/www_partypoker_com.trace.json
./lantern-data/unthrottled-assets/www_cnet_com.trace.json
./lantern-data/unthrottled-assets/www_filestube_com.trace.json
./lantern-data/unthrottled-assets/www_addthis_com.trace.json
./lantern-data/unthrottled-assets/www_pptv_com.trace.json
./lantern-data/unthrottled-assets/www_deviantart_com.trace.json
./lantern-data/unthrottled-assets/www_china_com_cn.trace.json
./lantern-data/unthrottled-assets/weather_com.trace.json
./lantern-data/unthrottled-assets/www_verizonwireless_com.trace.json
./lantern-data/unthrottled-assets/www_mlb_com.trace.json
./lantern-data/unthrottled-assets/www_tabelog_com.trace.json
./lantern-data/https---www-netflix-com--mobile-unthrottled-8-trace.json
./lantern-data/https---www-nokia-com--mobile-unthrottled-7-trace.json
./lantern-data/https---www-mgid-com-ru-mobile-unthrottled-2-trace.json
./lantern-data/https---www-rakuten-co-jp--mobile-unthrottled-7-trace.json
./lantern-data/https---weather-com--mobile-unthrottled-9-trace.json
./lantern-data/https---www-metacafe-com--mobile-unthrottled-4-trace.json
./lantern-data/https---mobile-twitter-com--mobile-unthrottled-5-trace.json
./lantern-data/https---www-symantec-com--mobile-unthrottled-3-trace.json
./lantern-data/https---www-nih-gov--mobile-unthrottled-8-trace.json
./lantern-data/https---www-vevo-com--mobile-unthrottled-2-trace.json
./lantern-data/https---www-amazon-co-jp--mobile-unthrottled-2-trace.json
./lantern-data/https---www-ning-com--mobile-unthrottled-6-trace.json
./lantern-data/https---wap-sogou-com--mobile-unthrottled-9-trace.json
./lantern-data/https---www-java-com-en--mobile-unthrottled-3-trace.json
./lantern-data/https---www-dawn-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-deviantart-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-att-com--mobile-unthrottled-1-trace.json
./lantern-data/http---m-iciba-com-mobile-unthrottled-5-trace.json
./lantern-data/https---www-addthis-com--mobile-unthrottled-9-trace.json
./lantern-data/https---www-cnet-com--mobile-unthrottled-5-trace.json
./lantern-data/https---gm-58-com-glsanfrancisco-sl--mobile-unthrottled-6-trace.json
./lantern-data/https---www-domaintools-com--mobile-unthrottled-7-trace.json
./lantern-data/https---www-gmx-net--mobile-unthrottled-3-trace.json
./lantern-data/https---m-hexun-com--mobile-unthrottled-8-trace.json
./lantern-data/https---mail-ru--mobile-unthrottled-1-trace.json
./lantern-data/https---www-shopping-com--mobile-unthrottled-4-trace.json
./lantern-data/https---www-codewars-com-mobile-unthrottled-6-trace.json
./lantern-data/https---www-msn-com--mobile-unthrottled-6-trace.json
./lantern-data/https---www-espn-com--mobile-unthrottled-6-trace.json
./lantern-data/https---www-hulu-com-welcome-mobile-unthrottled-3-trace.json
./lantern-data/https---www-so-net-ne-jp-m--mobile-unthrottled-3-trace.json
./lantern-data/https---stripe-com-docs-mobile-unthrottled-8-trace.json
./lantern-data/https---www-4shared-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-scribd-com--mobile-unthrottled-9-trace.json
./lantern-data/https---www-typepad-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-tianya-cn-m--mobile-unthrottled-5-trace.json
./lantern-data/https---www-blogger-com-about--mobile-unthrottled-9-trace.json
./lantern-data/https---www-flipkart-com-mobile-unthrottled-9-trace.json
./lantern-data/https---www-hatena-ne-jp--mobile-unthrottled-3-trace.json
./lantern-data/https---www-ifeng-com--mobile-unthrottled-7-trace.json
./lantern-data/https---www8-hp-com-us-en-home-html-mobile-unthrottled-8-trace.json
./lantern-data/https---www-imageshack-us-login-mobile-unthrottled-3-trace.json
./lantern-data/https---en-softonic-com-mobile-unthrottled-4-trace.json
./lantern-data/https---www-verizonwireless-com--mobile-unthrottled-7-trace.json
./lantern-data/https---www-mozilla-org-en-US--mobile-unthrottled-6-trace.json
./lantern-data/https---www-skype-com-en--mobile-unthrottled-5-trace.json
./lantern-data/https---www-linkedin-com--mobile-unthrottled-5-trace.json
./lantern-data/https---www-mlb-com--mobile-unthrottled-7-trace.json
./lantern-data/https---www-alexa-com--mobile-unthrottled-1-trace.json
./lantern-data/https---sfbay-craigslist-org--mobile-unthrottled-6-trace.json
./lantern-data/https---birdsarentreal-com-mobile-unthrottled-4-trace.json
./lantern-data/http---www-zol-com-cn--mobile-unthrottled-4-trace.json
./lantern-data/https---en-maktoob-yahoo-com--p-xa-mobile-unthrottled-4-trace.json
./lantern-data/https---m-youdao-com--mobile-unthrottled-3-trace.json
./lantern-data/https---www-partypoker-com--mobile-unthrottled-5-trace.json
./lantern-data/https---www-reddit-com--mobile-unthrottled-1-trace.json
./lantern-data/https---www-ebs-in-IPS--mobile-unthrottled-1-trace.json
./lantern-data/https---www-ocn-ne-jp--mobile-unthrottled-7-trace.json
./lantern-data/https---www-instagram-com--mobile-unthrottled-4-trace.json
./lantern-data/https---www-irs-gov--mobile-unthrottled-7-trace.json
./lantern-data/https---depositfiles-com--mobile-unthrottled-2-trace.json
./lantern-data/https---www-tumblr-com--mobile-unthrottled-5-trace.json
./lantern-data/https---m-facebook-com--mobile-unthrottled-2-trace.json
./lantern-data/https---www-bing-com--mobile-unthrottled-8-trace.json
./lantern-data/https---m-sogou-com--mobile-unthrottled-4-trace.json
./lantern-data/https---m-mop-com--mobile-unthrottled-6-trace.json
./lantern-data/https---www-thestar-com-my--mobile-unthrottled-3-trace.json
./lantern-data/https---www-orange-fr-portail-mobile-unthrottled-8-trace.json
./tracex_coldish.json.gz
./jsprofilegaps-trace.json
./posttask.json
./Profile-20220323T101302.json
./alltabz.gz
./oldnavychrome.net-export.json
./Profile-20200916T135544.json
./ilweb-loadload-butwascompiling.json
./Profile-20220822T091603.json
./paulirish-input.json
./cnnindo-click.json
./psweb-trace-names.json
./google-covid-page.json
./memgen-click-Profile-20201020T122216.json
./psweb-brush-trace.json
./had-recent-input.cjs-20220901142914.trace.json
./badtrace.json
./raisedbuttontrue.json
./tracecafedemo.json
./first-illustrator-cc-cloud-landing-processPseudoId.trace.json
./trace_coldish.json.gz
./trace_twitchjankchangingtabs.json.gz
./Profile-20220815T172812-notracingstarted.json
./Profile-20220426T171431.json
./aiweb-trace.json.gz
./wix-onlycputhrottle.json
./Profile-20220823T083058 copy.json
./bigboyithinkProfile-20220302T075442.json
./facebook-dotcom-processPseudoId.trace.json
./lol.json.gz
./examplecom-dt-plusstar-noscreenshot.json
./thevergerandom.json



./trace_noblur.json.gz
./Profile-20210915T085257.json
./examplecom-dt-plusstar.json
./smallishtrace-with-js-sampleproblem.json
./snake-goodnetlog.json
./gwsgoldburgertrace.json
./process-change.json
./lh-report-cpuprof-interrupted2.json
./trace_memoryinfra.json.gz
./boring-paulirish-trace.json
./ikea-latencyinfoflow.json
./devtools-load-trace.json
./paulirish-entry-timeProfile-20220429T193010.json
./trace_compute-intersections.json copy.gz



./buttontrue.json
./Profile-20220810T175433.json
./Profile-20220823T174417.json
./crocs-429-throttled.json
./trace_Wed_Apr_14_2021_3.30.41_PM.json.gz
./trace_Mon_Apr_20_2020_3.09.45_PM.json
./posttask-four-bare.json
./pptr-trace.json
./softnavs-on-moviesapp-bug-wayy-too-many-animations.json
./mybadtrace.json
./psi-thing.json
./failed-to-parse-cpu-profile.json
./trace_secondjankytrace.json.gz
./trace_huge-gpu-janks.json.gz
./Profile-20200420T122902.json
./worker-bubblesort.json
./illustrator-create-new-file.json
./Profile-20200429T124248.json
./Profile-20220817T120243.json
./wpttrace.json
./lh-fixtures/amp-m86.trace.json
./lh-fixtures/devtools-homepage-w-screenshots-trace.json
./lh-fixtures/progressive-app-m60.json
./lh-fixtures/process-change.json
./lh-fixtures/progressive-app.json
./lh-fixtures/tracingstarted-after-navstart.json
./lh-fixtures/site-with-redirect.json
./lh-fixtures/load.json
./trace_compute-intersections.json
./jcrew-open-sidenav.json
./bestbuy-latencyinfoflow.json
./bk2.json
./alltabs-opp.json
./google-meet-menu-click.json
./elkzone.json
./trace_twitchjank.json.gz
./Profile-20200626T205619-slowmemes.json
./trace_cool.json.gz
./Profile-20200214T165958.json
./somepaulirish.json
./functioncall-mini-splits.json
./missing-events-allcats.json
./cnnindo-click.json.gz
./Profile-20221110T161321.json
./Chrome_111_trading_view_Profile-20230308T222839.json
./theverge4.json
./trace_Tue_Jan_24_2023_3.52.10_PM.json.gz
./webgl-flames-zoom.json
./slow-focus-in-gmail.trace.json
./Profile-20220802T161718.json
./cdt-reload-with-rcs.json
./tailwindcss-select-docs-result.json
./kissmyparcel-truncate-segmenter.json
./trace_bigasstrace.json.gz
./chrome110-crbug-1422846-got-a-maxcallstacksize-reproonce-on-zoomin.json
./burgerking-mobile.json
./theverge.json
./ui5repro.json
./threetabs.gz
./Profile-20220516T115841.json
./caltrainschedul-allevents.json
./vDKZvDMjYL - repro freezes and OOMs OPP sometimes (webpack profilingplugin)
./psi-analysistrace.json
./trace_snake-realtracing.json
./Profile-20220429T132241.json
./loadingtrace-in-opp.json
./Profile-20220802T155143.json
./Profile-20211005T105548.json
./Profile-20230209T122849-adam.json
./Chrome_110_trading_view_Profile-20230308T221633.json
./Profile-20221110T162202.json
./Profile-20200501T114616.json
./Profile-20230131T102229.json
./Profile-20220720T114626.json
./trace_bigdatauri.json.gz


./adobe-oom-traces/Venus_full_stack_trace_during_save_operation.json
./pauliirsh-enhancedtrace.devtools.json
./trace_Fri_Aug_07_2020_11.09.00_AM.json
./paulirish-withstarttimezmaybe3.json
./bestbuy-crashes-opp-piechart.json
./theverge3.json
./buttonfalse2.json
./Profile-20220815T172812.json

*/
const localtraces = `
./trace_full_trace_with_animations_slow_machine.json.gz
`;


const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

describe('TraceProcessor', async function() {
  setTraceModelTimeout(this);

  it.only('can use a trace processor', async () => {
    const processor = TraceModel.Processor.TraceProcessor.createWithAllHandlers();
    const filenames = [
      'basic.json.gz',
      ... localtraces.trim().split('\n').map(f => `http://localhost:9435/${f.trim()}`)
      ];
    const bad = [];
    for (const filename of filenames) {
      await parseAndLog(filename);
    }
    console.log('bad ones', bad);

    await wait(10000000);

    async function parseAndLog(filename: string) {
      console.log(filename);
      let file;
      try {
        file = await loadEventsFromTraceFile(filename);
      } catch (e) {
        console.error('JSON FAILURE WITH', filename, e );
        bad.push(filename);
        file = undefined;
        processor.reset();
        return;
      }
      // Check parsing after reset.
      processor.reset();
      assert.isNull(processor.data);
      try {
        await processor.parse(file);
      } catch(e) {
        console.error('PARSE FAILURE WITH', filename, e );
        bad.push(filename);
        file = undefined;
        processor.reset();
        // throw e;
        return;
      } finally {

      }

      assert.isNotNull(processor.data);
      console.log('meta',processor.data.Meta);
      // Cleanup.
      processor.reset();
    }
  });

  it('can be given a subset of handlers to run and will run just those along with the meta handler', async () => {
    const processor = new TraceModel.Processor.TraceProcessor({
      Animation: TraceModel.Handlers.ModelHandlers.Animation,
    });
    const file = await loadEventsFromTraceFile('animation.json.gz');
    await processor.parse(file);
    assert.isNotNull(processor.data);
    assert.deepEqual(Object.keys(processor.data || {}), ['Meta', 'Animation']);
  });

  it('does not error if the user does not enable the Meta handler when it is a dependency', async () => {
    assert.doesNotThrow(() => {
      new TraceModel.Processor.TraceProcessor({
        // Screenshots handler depends on Meta handler, so this is invalid.
        // However, the Processor automatically ensures the Meta handler is
        // enabled, so this should not cause an error.
        Screenshots: TraceModel.Handlers.ModelHandlers.Screenshots,
      });
    });
  });

  it('errors if the user does not provide the right handler dependencies', async () => {
    assert.throws(() => {
      new TraceModel.Processor.TraceProcessor({
        Renderer: TraceModel.Handlers.ModelHandlers.Renderer,
        // Invalid: the renderer depends on the samples handler, so the user should pass that in too.
      });
    }, /Required handler Samples not provided/);
  });

  it('emits periodic trace updates', async () => {
    const processor = new TraceModel.Processor.TraceProcessor(
        {
          Renderer: TraceModel.Handlers.ModelHandlers.Renderer,
          Samples: TraceModel.Handlers.ModelHandlers.Samples,
        },
        {
          // This trace is 8252 events long, lets emit 8 updates
          eventsPerChunk: 1_000,
        });

    let updateEventCount = 0;

    processor.addEventListener(TraceModel.Processor.TraceParseProgressEvent.eventName, () => {
      updateEventCount++;
    });

    const rawEvents = await loadEventsFromTraceFile('web-dev.json.gz');
    await processor.parse(rawEvents).then(() => {
      assert.strictEqual(updateEventCount, 8);
    });
  });

  describe('handler sorting', () => {
    const baseHandler = {
      data() {},
      handleEvent() {},
      reset() {},
    };

    function fillHandlers(
        handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}}):
        {[key: string]: TraceModel.Handlers.Types.TraceEventHandler} {
      const handlers: {[key: string]: TraceModel.Handlers.Types.TraceEventHandler} = {};
      for (const handler in handlersDeps) {
        handlers[handler] = {...baseHandler, ...handlersDeps[handler]};
      }
      return handlers;
    }

    it('sorts handlers satisfying their dependencies 1', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'Meta': {},
        'GPU': {
          deps() {
            return ['Meta'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['GPU'];
          },
        },
        'NetworkRequests': {
          deps() {
            return ['LayoutShifts'];
          },
        },
        'PageLoadMetrics': {
          deps() {
            return ['Renderer', 'GPU'];
          },
        },
        'Renderer': {
          deps() {
            return ['Screenshots'];
          },
        },
        'Screenshots': {
          deps() {
            return ['NetworkRequests', 'LayoutShifts'];
          },
        },
      };
      const handlers = fillHandlers(handlersDeps);

      const expectedOrder =
          ['Meta', 'GPU', 'LayoutShifts', 'NetworkRequests', 'Screenshots', 'Renderer', 'PageLoadMetrics'];
      assert.deepEqual([...TraceModel.Processor.sortHandlers(handlers).keys()], expectedOrder);
    });
    it('sorts handlers satisfying their dependencies 2', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'GPU': {
          deps() {
            return ['LayoutShifts', 'NetworkRequests'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['NetworkRequests'];
          },
        },
        'NetworkRequests': {},
      };
      const handlers = fillHandlers(handlersDeps);

      const expectedOrder = ['NetworkRequests', 'LayoutShifts', 'GPU'];
      assert.deepEqual([...TraceModel.Processor.sortHandlers(handlers).keys()], expectedOrder);
    });
    it('throws an error when a dependency cycle is present among handlers', () => {
      const handlersDeps: {[key: string]: {deps ? () : TraceModel.Handlers.Types.TraceEventHandlerName[]}} = {
        'Meta': {},
        'GPU': {
          deps() {
            return ['Meta'];
          },
        },
        'LayoutShifts': {
          deps() {
            return ['GPU', 'Renderer'];
          },
        },
        'NetworkRequests': {
          deps() {
            return ['LayoutShifts'];
          },
        },
        'Renderer': {
          deps() {
            return ['NetworkRequests'];
          },
        },
      };
      const handlers = fillHandlers(handlersDeps);
      const cyclePath = 'LayoutShifts->Renderer->NetworkRequests->LayoutShifts';
      assert.throws(
          () => TraceModel.Processor.sortHandlers(handlers),
          `Found dependency cycle in trace event handlers: ${cyclePath}`);
    });
  });
});
