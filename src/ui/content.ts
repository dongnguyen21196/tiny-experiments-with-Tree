/** Nội dung hướng dẫn tự biên soạn (không trích sách). */
export const DISCLAIMER =
  'Công cụ thực hành độc lập, lấy cảm hứng từ Tiny Experiments của Anne-Laure Le Cunff. Không phải sản phẩm chính thức và không được tác giả bảo trợ.';

export const COPY = {
  start: 'Có điều gì trong cách làm việc hoặc học tập mà bạn muốn thử khác đi?',
  action: 'Chọn một việc đủ cụ thể để lần tới bạn biết mình sẽ làm gì.',
  observe: 'Có chuyện gì đáng chú ý? Một câu cũng được.',
  missed: 'Lần này chưa thực hiện. Bạn có muốn ghi lại điều đã xảy ra không? (Không bắt buộc.)',
  reflect: 'Điều nào có ích? Điều nào chưa phù hợp? Bạn muốn thử gì tiếp?',
  unclear: 'Chưa rút ra kết luận cũng là một trạng thái hợp lệ. Bạn muốn thử thêm, đổi cách thử hay dừng ở đây?',
  stop: 'Bạn có thể dừng thử nghiệm này. Ghi lại điều muốn nhớ là tùy chọn.',
};

export interface Example {
  context: string;
  curiosity: string;
  action: string;
  days: number;
  weekdays: number[];
}

export const EXAMPLES: Example[] = [
  {
    context: 'Tập trung',
    curiosity: 'Mình có làm được việc khó tốt hơn nếu tắt thông báo vào buổi sáng không?',
    action: 'Tắt thông báo chat từ 9h đến 10h30 và làm một việc cần suy nghĩ sâu.',
    days: 10,
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    context: 'Tự học',
    curiosity: 'Tự đặt câu hỏi sau khi học có giúp mình nhớ bài lâu hơn không?',
    action: 'Sau mỗi buổi học, viết ba câu hỏi ôn và tự trả lời vào hôm sau.',
    days: 14,
    weekdays: [1, 3, 5],
  },
  {
    context: 'Họp & phối hợp',
    curiosity: 'Viết trước mục tiêu cuộc họp có làm buổi họp ngắn và rõ hơn không?',
    action: 'Trước mỗi cuộc họp mình chủ trì, gửi một dòng “mục tiêu cuộc họp”.',
    days: 14,
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    context: 'Kết thúc ngày',
    curiosity: 'Ghi lại việc dang dở cuối ngày có giúp sáng hôm sau bắt đầu nhanh hơn không?',
    action: 'Trước khi tắt máy, viết 2–3 dòng: đang dở gì, bước tiếp theo là gì.',
    days: 7,
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    context: 'Đọc & ghi chú',
    curiosity: 'Tóm tắt bằng lời của mình có giúp mình hiểu bài đọc chuyên môn hơn không?',
    action: 'Đọc xong một bài, viết tóm tắt 3 câu không nhìn lại bài.',
    days: 14,
    weekdays: [2, 4, 6],
  },
];
