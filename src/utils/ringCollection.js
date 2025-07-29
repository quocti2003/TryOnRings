// File này chỉ chứa mảng dữ liệu các mẫu nhẫn.
// Dễ dàng thêm, sửa, xóa nhẫn mà không cần đụng vào code component.

export const ringCollection = [
    {
        id: 'ring-01',
        name: 'Nhẫn Kim Cương Cổ Điển',
        image: '/img/ring1.png' // Đường dẫn đến ảnh trong thư mục /public
    },
    {
        id: 'ring-02',
        name: 'Vancleef Alhambra',
        image: '/img/vancleef_alhambra.png'
    },
    {
        id: 'ring-03',
        name: 'Vancleef Fleurette',
        image: '/img/vancleef_fleurette.png'
    },
    {
        id: 'ring-04',
        name: 'Vancleef Jasminsolitaire',
        image: '/images/rings/vancleef_jasminsolitaire.png'
    },
    {
        id: 'ring-05',
        name: '',
        image: ''
    }
];

// Giả sử bạn có thư mục public/images/rings/ chứa các file ảnh trên.